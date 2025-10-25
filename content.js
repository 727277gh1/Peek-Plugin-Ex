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
  
  debugLog('sidebar已显示，准备解释文本');
  
  if (selectedText) {
    explainText(selectedText);
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
        <button id="ai-send-btn" class="ai-send-btn">发送</button>
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

async function explainText(selectedText) {
  debugLog('explainText被调用');
  const config = await getConfig();
  debugLog('获取到配置:', { hasApiKey: !!config.apiKey, apiUrl: config.apiUrl, model: config.model });
  
  const systemPrompt = config.systemPrompt || '你是一个专业的助手，帮助用户理解和解释文本内容。';
  const userPrompt = config.userPrompt || '请解释以下内容：\n\n{selectedText}';
  
  const finalUserPrompt = userPrompt.replace('{selectedText}', selectedText);
  
  debugLog('添加用户消息到UI');
  addMessage('user', `解释选中的文本：\n${selectedText}`);
  
  conversationHistory = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: finalUserPrompt }
  ];
  
  debugLog('调用AI，对话历史长度:', conversationHistory.length);
  await callAI(null, true);
}

async function callAI(userMessage, isInitialExplain = false) {
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
    
    debugLog('准备调用API', { enableStream: config.enableStream });
    
    let tools = null;
    if (isFirstRequest && config.enableOnlineSearch) {
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
  streamToolCalls[messageId] = toolCalls;
  updateStreamMessage(messageId);
}

function updateStreamMessage(messageId) {
  const reasoning = streamReasoningContent[messageId] || '';
  const content = streamContent[messageId] || '';
  
  if (reasoning) {
    updateMessageWithReasoning(messageId, reasoning, content, true);
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
    copyBtn.className = 'ai-copy-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.title = '复制';
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
    
    if (!messageDiv.querySelector('.ai-copy-btn')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-copy-btn';
      copyBtn.innerHTML = '📋';
      copyBtn.title = '复制';
      copyBtn.addEventListener('click', () => copyToClipboard(messageId));
      contentWrapper.appendChild(copyBtn);
    }
    
    scrollToBottom();
  }
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
