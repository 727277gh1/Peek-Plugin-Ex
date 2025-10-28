let debugLogEnabled = false;

chrome.storage.sync.get({ enableDebugLog: false }, (config) => {
  debugLogEnabled = config.enableDebugLog;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.enableDebugLog) {
    debugLogEnabled = changes.enableDebugLog.newValue;
    debugLog('调试日志已' + (debugLogEnabled ? '启用' : '禁用'));
  }
});

function debugLog(...args) {
  if (debugLogEnabled) {
    console.log('[AI助手-Background]', ...args);
  }
}

function isRestrictedUrl(url) {
  if (!url) return true;
  
  // List of restricted URL patterns
  const restrictedPatterns = [
    /^chrome:\/\//,           // Chrome internal pages
    /^edge:\/\//,             // Edge internal pages
    /^about:/,                // About pages
    /^chrome-extension:\/\//, // Other extension pages
    /^extension:\/\//,        // Extension pages (generic)
    /^file:\/\//,             // Local files (often restricted)
    /^view-source:/,          // View source pages
    /^data:/,                 // Data URLs
    /^javascript:/,           // JavaScript URLs
    /chrome\.google\.com\/webstore/,  // Chrome Web Store
    /microsoftedge\.microsoft\.com\/addons/  // Edge Add-ons
  ];
  
  return restrictedPatterns.some(pattern => pattern.test(url));
}

chrome.runtime.onInstalled.addListener(() => {
  debugLog('扩展已安装/更新');
  chrome.contextMenus.create({
    id: "explainWithAI",
    title: "使用 AI 解释",
    contexts: ["selection"]
  });
  debugLog('上下文菜单已创建');
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "explainWithAI" && info.selectionText) {
    const selectedText = info.selectionText;
    debugLog('上下文菜单被点击', {
      tabId: tab.id,
      tabUrl: tab.url,
      selectedTextLength: selectedText.length
    });
    
    // Check if the URL is restricted
    if (isRestrictedUrl(tab.url)) {
      debugLog('检测到受限页面:', tab.url);
      chrome.notifications.create({
        type: 'basic',
        iconPath: 'icons/icon48.png',
        title: 'AI 文本解释助手',
        message: '抱歉，浏览器不允许扩展在此类页面运行（浏览器内部页面、扩展页面或错误页面）。',
        priority: 2
      });
      return;
    }
    
    try {
      debugLog('开始确保内容脚本已加载...');
      await ensureContentScriptLoaded(tab.id, tab.url);
      debugLog('内容脚本确认已加载');
      
      debugLog('发送openSidebar消息到tab:', tab.id);
      chrome.tabs.sendMessage(tab.id, {
        action: "openSidebar",
        selectedText: selectedText
      }, (response) => {
        if (chrome.runtime.lastError) {
          debugLog('发送消息出错:', chrome.runtime.lastError.message);
        } else {
          debugLog('消息发送成功，响应:', response);
        }
      });
    } catch (error) {
      console.error('[AI助手-Background] 加载内容脚本失败:', error);
      debugLog('错误详情:', error.stack);
      
      // Show user-friendly error notification
      chrome.notifications.create({
        type: 'basic',
        iconPath: 'icons/icon48.png',
        title: 'AI 文本解释助手',
        message: '无法在当前页面使用扩展。请尝试刷新页面或在其他网页使用。',
        priority: 2
      });
    }
  }
});

async function ensureContentScriptLoaded(tabId, url) {
  try {
    debugLog('尝试ping内容脚本...');
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    debugLog('内容脚本已经存在（ping成功）');
  } catch (error) {
    debugLog('内容脚本不存在，开始注入...', error.message);
    
    // Additional check for restricted URLs before injection attempt
    if (url && isRestrictedUrl(url)) {
      debugLog('URL受限，跳过注入:', url);
      throw new Error('Cannot inject scripts into restricted pages');
    }
    
    try {
      debugLog('注入JS文件: markdown.js, content.js');
      const scriptResult = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['markdown.js', 'content.js']
      });
      debugLog('JS注入结果:', scriptResult);
      
      debugLog('注入CSS文件: sidebar.css');
      const cssResult = await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['sidebar.css']
      });
      debugLog('CSS注入结果:', cssResult);
      
      debugLog('等待100ms让脚本初始化...');
      await new Promise(resolve => setTimeout(resolve, 100));
      debugLog('脚本注入完成');
    } catch (injectError) {
      console.error('[AI助手-Background] 注入脚本失败:', injectError);
      debugLog('注入错误详情:', injectError.stack);
      throw injectError;
    }
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
