chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "explainWithAI",
    title: "使用 AI 解释",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "explainWithAI" && info.selectionText) {
    const selectedText = info.selectionText;
    
    try {
      await ensureContentScriptLoaded(tab.id);
      
      chrome.tabs.sendMessage(tab.id, {
        action: "openSidebar",
        selectedText: selectedText
      });
    } catch (error) {
      console.error('Failed to load content script:', error);
    }
  }
});

async function ensureContentScriptLoaded(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['markdown.js', 'content.js']
    });
    
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['sidebar.css']
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callOpenAI") {
    callOpenAI(request.apiConfig, request.messages, request.tools)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "callOpenAIStream") {
    handleStreamRequest(request, sender);
    return true;
  }
});

async function handleStreamRequest(request, sender) {
  try {
    const { apiConfig, messages, messageId, tools } = request;
    
    const requestBody = {
      model: apiConfig.model,
      messages: messages,
      temperature: apiConfig.temperature || 0.7,
      max_tokens: apiConfig.maxTokens || 2000,
      stream: true
    };
    
    if (apiConfig.enableReasoning) {
      requestBody.reasoning_effort = 'high';
    }
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
    
    const response = await fetch(apiConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      chrome.tabs.sendMessage(sender.tab.id, {
        action: "streamError",
        messageId: messageId,
        error: errorData.error?.message || `API 请求失败: ${response.status}`
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "streamComplete",
              messageId: messageId
            });
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const content = delta?.content;
            const reasoningContent = delta?.reasoning_content;
            const toolCalls = delta?.tool_calls;
            
            if (reasoningContent) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "streamReasoningChunk",
                messageId: messageId,
                content: reasoningContent
              });
            }
            
            if (content) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "streamChunk",
                messageId: messageId,
                content: content
              });
            }
            
            if (toolCalls) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "streamToolCalls",
                messageId: messageId,
                toolCalls: toolCalls
              });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    }
    
    chrome.tabs.sendMessage(sender.tab.id, {
      action: "streamComplete",
      messageId: messageId
    });
    
  } catch (error) {
    chrome.tabs.sendMessage(sender.tab.id, {
      action: "streamError",
      messageId: messageId,
      error: error.message
    });
  }
}

async function callOpenAI(apiConfig, messages, tools) {
  const requestBody = {
    model: apiConfig.model,
    messages: messages,
    temperature: apiConfig.temperature || 0.7,
    max_tokens: apiConfig.maxTokens || 2000
  };
  
  if (apiConfig.enableReasoning) {
    requestBody.reasoning_effort = 'high';
  }
  
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }
  
  const response = await fetch(apiConfig.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    reasoningContent: data.choices[0].message.reasoning_content,
    toolCalls: data.choices[0].message.tool_calls
  };
}
