let sidebar = null;
let conversationHistory = [];
let isMinimized = false;
let isFirstRequest = true;
let userScrolledUp = false;
let autoScrollEnabled = true;
let debugLogEnabled = false;

chrome.storage.sync.get({ enableDebugLog: false }, (config) => {
  debugLogEnabled = config.enableDebugLog;
  debugLog('Content脚本初始化完成');
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.enableDebugLog) {
    debugLogEnabled = changes.enableDebugLog.newValue;
    debugLog('调试日志已' + (debugLogEnabled ? '启用' : '禁用'));
  }
});

function debugLog(...args) {
  if (debugLogEnabled) {
    console.log('[AI助手-Content]', ...args);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('收到消息:', request.action);
  
  if (request.action === "ping") {
    debugLog('响应ping请求');
    sendResponse({ status: "ok" });
    return true;
  } else if (request.action === "openSidebar") {
    debugLog('打开侧边栏，选中文本长度:', request.selectedText?.length);
    openSidebar(request.selectedText);
    sendResponse({ status: "sidebar opened" });
    return true;
  } else if (request.action === "streamChunk") {
    handleStreamChunk(request.messageId, request.content);
  } else if (request.action === "streamReasoningChunk") {
    handleStreamReasoningChunk(request.messageId, request.content);
  } else if (request.action === "streamToolCalls") {
    handleStreamToolCalls(request.messageId, request.toolCalls);
  } else if (request.action === "streamComplete") {
    handleStreamComplete(request.messageId);
  } else if (request.action === "streamError") {
    handleStreamError(request.messageId, request.error);
  }
});

let pendingSelectedText = null;

function openSidebar(selectedText) {
  debugLog('openSidebar被调用，sidebar是否存在:', !!sidebar);
  
  if (!sidebar) {
    debugLog('创建新的sidebar');
    createSidebar();
  }
  
  debugLog('设置sidebar显示');
  sidebar.style.display = 'flex';
  isMinimized = false;
  sidebar.classList.remove('minimized');
  
  conversationHistory = [];
  isFirstRequest = true;
  
  const messagesContainer = sidebar.querySelector('#ai-messages');
  messagesContainer.innerHTML = '';
  
  debugLog('sidebar已显示，准备显示高级选项');
  
  if (selectedText) {
    pendingSelectedText = selectedText;
    // Always show advanced options modal first
    showAdvancedOptionsModal();
  }
}

function createSidebar() {
  debugLog('开始创建sidebar元素');
  
  sidebar = document.createElement('div');
  sidebar.id = 'ai-explain-sidebar';
  sidebar.innerHTML = `
    <div class="ai-sidebar-header">
      <h3>AI 助手</h3>
      <div class="ai-header-buttons">
        <button id="ai-minimize-btn" class="ai-icon-btn" title="最小化">−</button>
        <button id="ai-close-btn" class="ai-icon-btn" title="关闭">✕</button>
      </div>
    </div>
    <div class="ai-sidebar-content">
      <div id="ai-messages" class="ai-messages">
        <button id="ai-scroll-to-bottom" class="ai-scroll-to-bottom" title="滚动到底部" style="display: none;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
      <div class="ai-input-container">
        <textarea id="ai-input" class="ai-input" placeholder="输入消息..." rows="3"></textarea>
        <div class="ai-button-row">
          <button id="ai-advanced-btn" class="ai-advanced-btn" title="高级选项">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m8.66-15l-3 5.196M9.34 17.804l-3 5.196M23 12h-6m-6 0H1m18.66 8.66l-3-5.196M9.34 6.196l-3-5.196"></path>
            </svg>
            高级选项
          </button>
          <button id="ai-send-btn" class="ai-send-btn">发送</button>
        </div>
      </div>
    </div>
  `;
  
  debugLog('将sidebar添加到body');
  document.body.appendChild(sidebar);
  debugLog('sidebar已添加到DOM，元素ID:', sidebar.id);
  
  sidebar.querySelector('#ai-close-btn').addEventListener('click', () => {
    sidebar.style.display = 'none';
  });
  
  sidebar.querySelector('#ai-minimize-btn').addEventListener('click', () => {
    toggleMinimize();
  });
  
  sidebar.querySelector('#ai-sidebar-header')?.addEventListener('click', (e) => {
    if (isMinimized && e.target.classList.contains('ai-sidebar-header')) {
      toggleMinimize();
    }
  });
  
  sidebar.querySelector('#ai-send-btn').addEventListener('click', () => {
    sendMessage();
  });
  
  sidebar.querySelector('#ai-advanced-btn').addEventListener('click', () => {
    showAdvancedOptionsModal();
  });
  
  sidebar.querySelector('#ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  const messagesContainer = sidebar.querySelector('#ai-messages');
  const scrollButton = sidebar.querySelector('#ai-scroll-to-bottom');
  
  messagesContainer.addEventListener('scroll', () => {
    const threshold = 100;
    const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
    
    userScrolledUp = !isNearBottom;
    
    if (scrollButton) {
      scrollButton.style.display = userScrolledUp ? 'flex' : 'none';
    }
  });
  
  scrollButton.addEventListener('click', () => {
    scrollToBottom(true);
    userScrolledUp = false;
    scrollButton.style.display = 'none';
  });
  
  loadAutoScrollConfig();
}

async function loadAutoScrollConfig() {
  const config = await getConfig();
  autoScrollEnabled = config.enableAutoScroll !== false;
}

function scrollToBottom(force = false) {
  if (!sidebar) return;
  
  const messagesContainer = sidebar.querySelector('#ai-messages');
  if (!messagesContainer) return;
  
  if (force || (autoScrollEnabled && !userScrolledUp)) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function toggleMinimize() {
  isMinimized = !isMinimized;
  if (isMinimized) {
    sidebar.classList.add('minimized');
  } else {
    sidebar.classList.remove('minimized');
  }
}

function sendMessage() {
  const input = sidebar.querySelector('#ai-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  addMessage('user', message);
  input.value = '';
  
  callAI(message);
}

async function explainText(selectedText, customPrompt = null, overrideReasoning = null, overrideOnlineSearch = null) {
  debugLog('explainText被调用');
  const config = await getConfig();
  debugLog('获取到配置:', { hasApiKey: !!config.apiKey, apiUrl: config.apiUrl, model: config.model });
  
  const systemPrompt = config.systemPrompt || '你是一个专业的助手，帮助用户理解和解释文本内容。';
  const userPrompt = customPrompt || config.userPrompt || '请解释以下内容：\n\n{selectedText}';
  
  const finalUserPrompt = userPrompt.replace('{selectedText}', selectedText);
  
  debugLog('添加用户消息到UI');
  addMessage('user', `解释选中的文本：\n${selectedText}`);
  
  conversationHistory = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: finalUserPrompt }
  ];
  
  debugLog('调用AI，对话历史长度:', conversationHistory.length);
  await callAI(null, true, overrideReasoning, overrideOnlineSearch);
}

async function callAI(userMessage, isInitialExplain = false, overrideReasoning = null, overrideOnlineSearch = null) {
  debugLog('callAI被调用', { isInitialExplain, hasUserMessage: !!userMessage });
  
  if (userMessage && !isInitialExplain) {
    conversationHistory.push({ role: 'user', content: userMessage });
  }
  
  debugLog('添加loading消息');
  const loadingId = addMessage('assistant', '正在思考...');
  
  try {
    const config = await getConfig();
    
    if (!config.apiKey || !config.apiUrl) {
      debugLog('配置错误：缺少API密钥或URL');
      updateMessage(loadingId, '错误：请先在插件设置中配置 API 密钥和接口地址', true);
      return;
    }
    
    // Apply overrides if provided
    if (overrideReasoning !== null) {
      config.enableReasoning = overrideReasoning;
    }
    const enableOnlineSearchFinal = overrideOnlineSearch !== null ? overrideOnlineSearch : config.enableOnlineSearch;
    
    debugLog('准备调用API', { enableStream: config.enableStream, enableReasoning: config.enableReasoning, enableOnlineSearch: enableOnlineSearchFinal });
    
    let tools = null;
    if (isFirstRequest && enableOnlineSearchFinal) {
      tools = [{
        type: "function",
        function: {
          name: "online_search",
          description: "Search the internet for current information",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query"
              }
            },
            required: ["query"]
          }
        }
      }];
    }
    
    if (config.enableStream) {
      debugLog('发送流式请求到background');
      chrome.runtime.sendMessage({
        action: "callOpenAIStream",
        apiConfig: config,
        messages: conversationHistory,
        messageId: loadingId,
        tools: tools
      }, (response) => {
        if (chrome.runtime.lastError) {
          debugLog('发送流式消息出错:', chrome.runtime.lastError.message);
        } else {
          debugLog('流式请求已发送，响应:', response);
        }
      });
    } else {
      debugLog('发送非流式请求到background');
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "callOpenAI",
          apiConfig: config,
          messages: conversationHistory,
          tools: tools
        }, (response) => {
          if (chrome.runtime.lastError) {
            debugLog('发送非流式消息出错:', chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            debugLog('收到API响应');
            resolve(response.data);
          } else {
            debugLog('API返回错误:', response.error);
            reject(new Error(response.error));
          }
        });
      });
      
      if (response.reasoningContent) {
        updateMessageWithReasoning(loadingId, response.reasoningContent, response.content, true);
      } else {
        updateMessage(loadingId, response.content, true);
      }
      conversationHistory.push({ role: 'assistant', content: response.content });
    }
    
    isFirstRequest = false;
    
  } catch (error) {
    updateMessage(loadingId, `错误：${error.message}`, false);
  }
}

let streamContent = {};
let streamReasoningContent = {};
let streamToolCalls = {};

function handleStreamChunk(messageId, content) {
  if (!streamContent[messageId]) {
    streamContent[messageId] = '';
  }
  streamContent[messageId] += content;
  updateStreamMessage(messageId);
}

function handleStreamReasoningChunk(messageId, content) {
  if (!streamReasoningContent[messageId]) {
    streamReasoningContent[messageId] = '';
  }
  streamReasoningContent[messageId] += content;
  updateStreamMessage(messageId);
}

function handleStreamToolCalls(messageId, toolCalls) {
  if (!streamToolCalls[messageId]) {
    streamToolCalls[messageId] = [];
  }
  
  debugLog('收到工具调用流:', toolCalls);
  
  // Merge tool calls (they come incrementally)
  for (const newCall of toolCalls) {
    const existingCallIndex = streamToolCalls[messageId].findIndex(c => c.index === newCall.index);
    if (existingCallIndex >= 0) {
      const existingCall = streamToolCalls[messageId][existingCallIndex];
      if (newCall.function) {
        if (!existingCall.function) {
          existingCall.function = { name: '', arguments: '' };
        }
        if (newCall.function.name) {
          existingCall.function.name = newCall.function.name;
        }
        if (newCall.function.arguments) {
          existingCall.function.arguments += newCall.function.arguments;
          debugLog('累加参数，当前长度:', existingCall.function.arguments.length);
        }
      }
      if (newCall.id) {
        existingCall.id = newCall.id;
      }
      if (newCall.type) {
        existingCall.type = newCall.type;
      }
    } else {
      streamToolCalls[messageId].push({
        index: newCall.index,
        id: newCall.id || '',
        type: newCall.type || 'function',
        function: {
          name: newCall.function?.name || '',
          arguments: newCall.function?.arguments || ''
        }
      });
      debugLog('新增工具调用，索引:', newCall.index);
    }
  }
  
  debugLog('当前工具调用状态:', streamToolCalls[messageId]);
  updateStreamMessage(messageId);
}

function updateStreamMessage(messageId) {
  const reasoning = streamReasoningContent[messageId] || '';
  const content = streamContent[messageId] || '';
  const toolCalls = streamToolCalls[messageId] || [];
  
  if (reasoning || toolCalls.length > 0) {
    updateMessageWithReasoningAndTools(messageId, reasoning, content, toolCalls, true);
  } else {
    updateMessage(messageId, content, true);
  }
}

function handleStreamComplete(messageId) {
  const finalContent = streamContent[messageId] || '';
  conversationHistory.push({ role: 'assistant', content: finalContent });
  delete streamContent[messageId];
  delete streamReasoningContent[messageId];
  delete streamToolCalls[messageId];
  isFirstRequest = false;
}

function handleStreamError(messageId, error) {
  updateMessage(messageId, `错误：${error}`, false);
  delete streamContent[messageId];
  delete streamReasoningContent[messageId];
  delete streamToolCalls[messageId];
}

function addMessage(role, content) {
  const messagesContainer = sidebar.querySelector('#ai-messages');
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `ai-message ai-message-${role}`;
  messageDiv.id = messageId;
  
  const roleLabel = document.createElement('div');
  roleLabel.className = 'ai-message-role';
  roleLabel.textContent = role === 'user' ? '你' : 'AI';
  
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'ai-message-content-wrapper';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'ai-message-content';
  
  if (role === 'user') {
    contentDiv.textContent = content;
  } else {
    contentDiv.innerHTML = parseMarkdown(content);
  }
  
  contentWrapper.appendChild(contentDiv);
  
  if (role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-copy-btn-inline';
    copyBtn.innerHTML = '📋 复制';
    copyBtn.title = '复制内容';
    copyBtn.addEventListener('click', () => copyToClipboard(messageId));
    contentWrapper.appendChild(copyBtn);
  }
  
  messageDiv.appendChild(roleLabel);
  messageDiv.appendChild(contentWrapper);
  messagesContainer.appendChild(messageDiv);
  
  scrollToBottom();
  
  return messageId;
}

function updateMessage(messageId, content, useMarkdown = false) {
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) {
    const contentDiv = messageDiv.querySelector('.ai-message-content');
    
    if (useMarkdown) {
      contentDiv.innerHTML = parseMarkdown(content);
    } else {
      contentDiv.textContent = content;
    }
    
    scrollToBottom();
  }
}

function updateMessageWithReasoning(messageId, reasoningContent, mainContent, useMarkdown = false) {
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) {
    let contentWrapper = messageDiv.querySelector('.ai-message-content-wrapper');
    if (!contentWrapper) {
      contentWrapper = document.createElement('div');
      contentWrapper.className = 'ai-message-content-wrapper';
      const oldContent = messageDiv.querySelector('.ai-message-content');
      if (oldContent) {
        messageDiv.removeChild(oldContent);
      }
      messageDiv.appendChild(contentWrapper);
    }
    
    contentWrapper.innerHTML = '';
    
    if (reasoningContent) {
      const reasoningDiv = document.createElement('div');
      reasoningDiv.className = 'ai-reasoning-content';
      const reasoningTitle = document.createElement('div');
      reasoningTitle.className = 'ai-reasoning-title';
      reasoningTitle.innerHTML = '💭 思考过程';
      const reasoningText = document.createElement('div');
      reasoningText.className = 'ai-reasoning-text';
      reasoningText.textContent = reasoningContent;
      reasoningDiv.appendChild(reasoningTitle);
      reasoningDiv.appendChild(reasoningText);
      contentWrapper.appendChild(reasoningDiv);
    }
    
    if (mainContent) {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'ai-message-content';
      if (useMarkdown) {
        contentDiv.innerHTML = parseMarkdown(mainContent);
      } else {
        contentDiv.textContent = mainContent;
      }
      contentWrapper.appendChild(contentDiv);
    }
    
    if (!contentWrapper.querySelector('.ai-copy-btn-inline')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-copy-btn-inline';
      copyBtn.innerHTML = '📋 复制';
      copyBtn.title = '复制内容';
      copyBtn.addEventListener('click', () => copyToClipboard(messageId));
      contentWrapper.appendChild(copyBtn);
    }
    
    scrollToBottom();
  }
}

function updateMessageWithReasoningAndTools(messageId, reasoningContent, mainContent, toolCalls, useMarkdown = false) {
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) {
    let contentWrapper = messageDiv.querySelector('.ai-message-content-wrapper');
    if (!contentWrapper) {
      contentWrapper = document.createElement('div');
      contentWrapper.className = 'ai-message-content-wrapper';
      const oldContent = messageDiv.querySelector('.ai-message-content');
      if (oldContent) {
        messageDiv.removeChild(oldContent);
      }
      messageDiv.appendChild(contentWrapper);
    }
    
    // Update reasoning (only if changed)
    let reasoningDiv = contentWrapper.querySelector('.ai-reasoning-content');
    if (reasoningContent) {
      if (!reasoningDiv) {
        reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'ai-reasoning-content';
        const reasoningTitle = document.createElement('div');
        reasoningTitle.className = 'ai-reasoning-title';
        reasoningTitle.innerHTML = '💭 思考过程';
        reasoningDiv.appendChild(reasoningTitle);
        const reasoningText = document.createElement('div');
        reasoningText.className = 'ai-reasoning-text';
        reasoningDiv.appendChild(reasoningText);
        contentWrapper.insertBefore(reasoningDiv, contentWrapper.firstChild);
      }
      const reasoningText = reasoningDiv.querySelector('.ai-reasoning-text');
      if (reasoningText && reasoningText.textContent !== reasoningContent) {
        reasoningText.textContent = reasoningContent;
      }
    }
    
    // Update tool calls
    let toolContainer = contentWrapper.querySelector('.ai-tool-calls-container');
    if (!toolContainer && toolCalls && toolCalls.length > 0) {
      toolContainer = document.createElement('div');
      toolContainer.className = 'ai-tool-calls-container';
      // Insert after reasoning or at the beginning
      if (reasoningDiv) {
        reasoningDiv.insertAdjacentElement('afterend', toolContainer);
      } else {
        contentWrapper.insertBefore(toolContainer, contentWrapper.firstChild);
      }
    }
    
    if (toolCalls && toolCalls.length > 0 && toolContainer) {
      // Clear and re-render tool calls only if needed
      const newToolsHTML = [];
      for (const toolCall of toolCalls) {
        if (toolCall.function && toolCall.function.name === 'online_search') {
          const toolDiv = renderOnlineSearchTool(toolCall);
          if (toolDiv) {
            newToolsHTML.push(toolDiv.outerHTML);
          }
        }
      }
      const newHTML = newToolsHTML.join('');
      if (toolContainer.innerHTML !== newHTML) {
        toolContainer.innerHTML = '';
        for (const toolCall of toolCalls) {
          if (toolCall.function && toolCall.function.name === 'online_search') {
            const toolDiv = renderOnlineSearchTool(toolCall);
            if (toolDiv) {
              toolContainer.appendChild(toolDiv);
            }
          }
        }
        // Re-attach event listeners for toggle buttons
        toolContainer.querySelectorAll('.ai-tool-search-header').forEach(header => {
          const toggle = header.querySelector('.ai-tool-search-toggle');
          const content = header.parentElement.querySelector('.ai-tool-search-content');
          if (toggle && content) {
            header.addEventListener('click', () => {
              const isVisible = content.style.display !== 'none';
              content.style.display = isVisible ? 'none' : 'block';
              toggle.textContent = isVisible ? '▼' : '▲';
            });
          }
        });
      }
    }
    
    // Update main content
    let contentDiv = contentWrapper.querySelector('.ai-message-content');
    if (mainContent) {
      if (!contentDiv) {
        contentDiv = document.createElement('div');
        contentDiv.className = 'ai-message-content';
        // Insert before copy button if exists
        const copyBtn = contentWrapper.querySelector('.ai-copy-btn');
        if (copyBtn) {
          contentWrapper.insertBefore(contentDiv, copyBtn);
        } else {
          contentWrapper.appendChild(contentDiv);
        }
      }
      if (useMarkdown) {
        const newHTML = parseMarkdown(mainContent);
        if (contentDiv.innerHTML !== newHTML) {
          contentDiv.innerHTML = newHTML;
        }
      } else {
        if (contentDiv.textContent !== mainContent) {
          contentDiv.textContent = mainContent;
        }
      }
    }
    
    // Add copy button if not exists (at the end of content)
    if (!contentWrapper.querySelector('.ai-copy-btn-inline')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-copy-btn-inline';
      copyBtn.innerHTML = '📋 复制';
      copyBtn.title = '复制内容';
      copyBtn.addEventListener('click', () => copyToClipboard(messageId));
      contentWrapper.appendChild(copyBtn);
    }
    
    scrollToBottom();
  }
}

function renderOnlineSearchTool(toolCall) {
  try {
    const args = toolCall.function.arguments;
    if (!args) return null;
    
    let parsedArgs;
    try {
      parsedArgs = JSON.parse(args);
    } catch (e) {
      debugLog('解析工具调用参数失败:', e, args);
      return null;
    }
    
    const toolDiv = document.createElement('div');
    toolDiv.className = 'ai-tool-search';
    
    // Show result if available (result takes priority over progress)
    if (parsedArgs.result) {
      let resultData;
      try {
        resultData = JSON.parse(parsedArgs.result);
        debugLog('解析result数据成功:', resultData);
      } catch (e) {
        debugLog('解析result JSON失败:', e, parsedArgs.result);
        // If result parsing fails, show progress instead
        if (parsedArgs.progress) {
          const progressDiv = document.createElement('div');
          progressDiv.className = 'ai-tool-search-progress';
          progressDiv.innerHTML = `
            <div class="ai-tool-search-icon">🔍</div>
            <div class="ai-tool-search-text">${escapeHtml(parsedArgs.progress)}</div>
          `;
          toolDiv.appendChild(progressDiv);
        }
        return toolDiv;
      }
      
      if (resultData && resultData.cardInfo) {
        const cardInfo = resultData.cardInfo;
        const resultDiv = document.createElement('div');
        resultDiv.className = 'ai-tool-search-result';
        
        // Collapsible header
        const header = document.createElement('div');
        header.className = 'ai-tool-search-header';
        header.innerHTML = `
          <div class="ai-tool-search-header-content">
            <span class="ai-tool-search-icon">🔍</span>
            <span class="ai-tool-search-title">${escapeHtml(cardInfo.title || cardInfo.shortTitle || '在线搜索结果')}</span>
          </div>
          <button class="ai-tool-search-toggle">▲</button>
        `;
        resultDiv.appendChild(header);
        
        // Collapsible content (default expanded)
        const content = document.createElement('div');
        content.className = 'ai-tool-search-content';
        content.style.display = 'block';
        
        if (cardInfo.cardItems && Array.isArray(cardInfo.cardItems)) {
          debugLog('处理cardItems，数量:', cardInfo.cardItems.length);
          for (const item of cardInfo.cardItems) {
            if (item.type === '2001' && item.content) {
              // Search queries
              try {
                const queries = JSON.parse(item.content);
                debugLog('解析搜索关键词:', queries);
                if (Array.isArray(queries) && queries.length > 0) {
                  const queriesDiv = document.createElement('div');
                  queriesDiv.className = 'ai-tool-search-queries';
                  queriesDiv.innerHTML = `<div class="ai-tool-search-section-title">搜索关键词</div>`;
                  const queryList = document.createElement('div');
                  queryList.className = 'ai-tool-search-query-list';
                  queries.forEach(q => {
                    const tag = document.createElement('span');
                    tag.className = 'ai-tool-search-query-tag';
                    tag.textContent = q;
                    queryList.appendChild(tag);
                  });
                  queriesDiv.appendChild(queryList);
                  content.appendChild(queriesDiv);
                }
              } catch (e) {
                debugLog('解析搜索关键词失败:', e);
              }
            } else if (item.type === '2002' && item.content) {
              // References
              try {
                const refs = JSON.parse(item.content);
                debugLog('解析参考资料，数量:', refs.length);
                if (Array.isArray(refs) && refs.length > 0) {
                  const refsDiv = document.createElement('div');
                  refsDiv.className = 'ai-tool-search-references';
                  
                  // Header with expand/collapse all
                  const refsHeader = document.createElement('div');
                  refsHeader.className = 'ai-tool-search-refs-header';
                  refsHeader.innerHTML = `
                    <div class="ai-tool-search-section-title">参考资料 (${refs.length}篇)</div>
                    <button class="ai-tool-search-refs-toggle-all" data-expanded="false">展开全部</button>
                  `;
                  refsDiv.appendChild(refsHeader);
                  
                  const refList = document.createElement('div');
                  refList.className = 'ai-tool-search-ref-list';
                  
                  refs.forEach((ref, index) => {
                    const refItem = document.createElement('div');
                    refItem.className = 'ai-tool-search-ref-item';
                    
                    // Compact view (always visible)
                    const refCompact = document.createElement('div');
                    refCompact.className = 'ai-tool-search-ref-compact';
                    refCompact.innerHTML = `
                      <div class="ai-tool-search-ref-header-row">
                        <span class="ai-tool-search-ref-index">${ref.idIndex}</span>
                        <a href="${ref.url}" target="_blank" rel="noopener noreferrer" class="ai-tool-search-ref-title-link" onclick="event.stopPropagation()">
                          ${escapeHtml(ref.name)}
                        </a>
                      </div>
                    `;
                    
                    // Expandable detail view
                    const refDetail = document.createElement('div');
                    refDetail.className = 'ai-tool-search-ref-detail';
                    refDetail.style.display = 'none';
                    refDetail.innerHTML = `
                      <div class="ai-tool-search-ref-snippet">${escapeHtml(ref.snippet)}</div>
                      <div class="ai-tool-search-ref-footer">
                        <span class="ai-tool-search-ref-site">📄 ${escapeHtml(ref.siteName)}</span>
                        <a href="${ref.url}" target="_blank" rel="noopener noreferrer" class="ai-tool-search-ref-link">
                          访问链接 →
                        </a>
                      </div>
                    `;
                    
                    refItem.appendChild(refCompact);
                    refItem.appendChild(refDetail);
                    
                    // Toggle detail on click
                    refCompact.addEventListener('click', (e) => {
                      if (e.target.tagName !== 'A') {
                        const isExpanded = refDetail.style.display !== 'none';
                        refDetail.style.display = isExpanded ? 'none' : 'block';
                        refItem.classList.toggle('expanded', !isExpanded);
                      }
                    });
                    
                    refList.appendChild(refItem);
                  });
                  
                  // Toggle all functionality
                  const toggleAllBtn = refsHeader.querySelector('.ai-tool-search-refs-toggle-all');
                  toggleAllBtn.addEventListener('click', () => {
                    const isExpanded = toggleAllBtn.dataset.expanded === 'true';
                    const newState = !isExpanded;
                    
                    refList.querySelectorAll('.ai-tool-search-ref-detail').forEach(detail => {
                      detail.style.display = newState ? 'block' : 'none';
                    });
                    
                    refList.querySelectorAll('.ai-tool-search-ref-item').forEach(item => {
                      item.classList.toggle('expanded', newState);
                    });
                    
                    toggleAllBtn.dataset.expanded = newState;
                    toggleAllBtn.textContent = newState ? '收起全部' : '展开全部';
                  });
                  
                  refsDiv.appendChild(refList);
                  content.appendChild(refsDiv);
                }
              } catch (e) {
                debugLog('解析参考资料失败:', e);
              }
            }
          }
        }
        
        resultDiv.appendChild(content);
        
        // Toggle functionality
        header.addEventListener('click', () => {
          const isVisible = content.style.display !== 'none';
          content.style.display = isVisible ? 'none' : 'block';
          header.querySelector('.ai-tool-search-toggle').textContent = isVisible ? '▼' : '▲';
        });
        
        toolDiv.appendChild(resultDiv);
      } else {
        debugLog('resultData 没有 cardInfo');
      }
    } else if (parsedArgs.progress) {
      // Only show progress if no result is available
      const progressDiv = document.createElement('div');
      progressDiv.className = 'ai-tool-search-progress';
      progressDiv.innerHTML = `
        <div class="ai-tool-search-icon">🔍</div>
        <div class="ai-tool-search-text">${escapeHtml(parsedArgs.progress)}</div>
      `;
      toolDiv.appendChild(progressDiv);
    }
    
    // Return null if toolDiv is empty
    if (toolDiv.children.length === 0) {
      return null;
    }
    
    return toolDiv;
  } catch (e) {
    debugLog('渲染在线搜索工具出错:', e);
    return null;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function copyToClipboard(messageId) {
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) {
    const contentDiv = messageDiv.querySelector('.ai-message-content');
    const reasoningDiv = messageDiv.querySelector('.ai-reasoning-text');
    
    let textToCopy = '';
    if (reasoningDiv) {
      textToCopy += '思考过程：\n' + reasoningDiv.textContent + '\n\n';
    }
    if (contentDiv) {
      textToCopy += contentDiv.textContent;
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      const copyBtn = messageDiv.querySelector('.ai-copy-btn');
      if (copyBtn) {
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓';
        copyBtn.style.color = '#4caf50';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.style.color = '';
        }, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }
}

async function showAdvancedOptionsModal() {
  debugLog('显示高级选项模态框');
  const config = await getConfig();
  const input = sidebar.querySelector('#ai-input');
  const currentInput = input.value.trim();
  
  // For initial text explanation, use the template
  let initialPrompt = '';
  if (pendingSelectedText && isFirstRequest) {
    const userPromptTemplate = config.userPrompt || '请解释以下内容：\n\n{selectedText}';
    initialPrompt = userPromptTemplate.replace('{selectedText}', pendingSelectedText);
  } else {
    initialPrompt = currentInput;
  }
  
  // Create modal overlay
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'ai-advanced-options-modal-overlay';
  modalOverlay.className = 'ai-modal-overlay';
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'ai-prompt-edit-modal';
  modal.innerHTML = `
    <div class="ai-modal-header">
      <h3>高级选项</h3>
      <button class="ai-modal-close-btn" title="关闭">✕</button>
    </div>
    <div class="ai-modal-body">
      <div class="ai-modal-section">
        <label class="ai-modal-label">提示词内容</label>
        <textarea class="ai-modal-textarea" id="ai-modal-prompt" rows="10">${escapeHtml(initialPrompt)}</textarea>
        <span class="ai-modal-help">编辑上方内容后点击发送</span>
      </div>
      <div class="ai-modal-section">
        <label class="ai-modal-section-title">高级选项</label>
        <div class="ai-modal-options">
          <label class="ai-modal-checkbox-label">
            <input type="checkbox" id="ai-modal-reasoning" ${config.enableReasoning ? 'checked' : ''}>
            <span>💭 启用思考链</span>
          </label>
          <label class="ai-modal-checkbox-label">
            <input type="checkbox" id="ai-modal-online-search" ${config.enableOnlineSearch ? 'checked' : ''}>
            <span>🔍 启用在线搜索</span>
          </label>
        </div>
      </div>
    </div>
    <div class="ai-modal-footer">
      <button class="ai-modal-btn ai-modal-btn-secondary" id="ai-modal-cancel">取消</button>
      <button class="ai-modal-btn ai-modal-btn-primary" id="ai-modal-send">发送</button>
    </div>
  `;
  
  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);
  
  // Add event listeners
  const closeBtn = modal.querySelector('.ai-modal-close-btn');
  const cancelBtn = modal.querySelector('#ai-modal-cancel');
  const sendBtn = modal.querySelector('#ai-modal-send');
  const promptTextarea = modal.querySelector('#ai-modal-prompt');
  
  const closeModal = () => {
    modalOverlay.remove();
  };
  
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });
  
  sendBtn.addEventListener('click', () => {
    const customPrompt = promptTextarea.value.trim();
    const enableReasoning = modal.querySelector('#ai-modal-reasoning').checked;
    const enableOnlineSearch = modal.querySelector('#ai-modal-online-search').checked;
    
    if (!customPrompt) {
      return;
    }
    
    debugLog('使用高级选项发送:', { customPrompt, enableReasoning, enableOnlineSearch });
    closeModal();
    
    // Clear input field
    input.value = '';
    
    // If this is for initial explanation
    if (pendingSelectedText && isFirstRequest) {
      explainText(pendingSelectedText, customPrompt, enableReasoning, enableOnlineSearch);
    } else {
      // For regular message
      addMessage('user', customPrompt);
      callAI(customPrompt, false, enableReasoning, enableOnlineSearch);
    }
  });
  
  // Focus on textarea
  promptTextarea.focus();
  promptTextarea.setSelectionRange(promptTextarea.value.length, promptTextarea.value.length);
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      apiKey: '',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2000,
      enableStream: true,
      enableReasoning: false,
      enableOnlineSearch: false,
      enableAutoScroll: true,
      enableDebugLog: false,
      systemPrompt: '你是一个专业的助手，帮助用户理解和解释文本内容。',
      userPrompt: '请解释以下内容：\n\n{selectedText}'
    }, resolve);
  });
}
