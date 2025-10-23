let sidebar = null;
let conversationHistory = [];
let isMinimized = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSidebar") {
    openSidebar(request.selectedText);
  } else if (request.action === "streamChunk") {
    handleStreamChunk(request.messageId, request.content);
  } else if (request.action === "streamComplete") {
    handleStreamComplete(request.messageId);
  } else if (request.action === "streamError") {
    handleStreamError(request.messageId, request.error);
  }
});

function openSidebar(selectedText) {
  if (!sidebar) {
    createSidebar();
  }
  
  sidebar.style.display = 'flex';
  isMinimized = false;
  sidebar.classList.remove('minimized');
  
  conversationHistory = [];
  
  const messagesContainer = sidebar.querySelector('#ai-messages');
  messagesContainer.innerHTML = '';
  
  if (selectedText) {
    explainText(selectedText);
  }
}

function createSidebar() {
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
      <div id="ai-messages" class="ai-messages"></div>
      <div class="ai-input-container">
        <textarea id="ai-input" class="ai-input" placeholder="输入消息..." rows="3"></textarea>
        <button id="ai-send-btn" class="ai-send-btn">发送</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(sidebar);
  
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
  const config = await getConfig();
  
  const systemPrompt = config.systemPrompt || '你是一个专业的助手，帮助用户理解和解释文本内容。';
  const userPrompt = config.userPrompt || '请解释以下内容：\n\n{selectedText}';
  
  const finalUserPrompt = userPrompt.replace('{selectedText}', selectedText);
  
  addMessage('user', `解释选中的文本：\n${selectedText}`);
  
  conversationHistory = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: finalUserPrompt }
  ];
  
  await callAI(null, true);
}

async function callAI(userMessage, isInitialExplain = false) {
  if (userMessage && !isInitialExplain) {
    conversationHistory.push({ role: 'user', content: userMessage });
  }
  
  const loadingId = addMessage('assistant', '正在思考...');
  
  try {
    const config = await getConfig();
    
    if (!config.apiKey || !config.apiUrl) {
      updateMessage(loadingId, '错误：请先在插件设置中配置 API 密钥和接口地址', true);
      return;
    }
    
    if (config.enableStream) {
      chrome.runtime.sendMessage({
        action: "callOpenAIStream",
        apiConfig: config,
        messages: conversationHistory,
        messageId: loadingId
      });
    } else {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "callOpenAI",
          apiConfig: config,
          messages: conversationHistory
        }, (response) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        });
      });
      
      conversationHistory.push({ role: 'assistant', content: response });
      updateMessage(loadingId, response, true);
    }
    
  } catch (error) {
    updateMessage(loadingId, `错误：${error.message}`, false);
  }
}

let streamContent = {};

function handleStreamChunk(messageId, content) {
  if (!streamContent[messageId]) {
    streamContent[messageId] = '';
  }
  streamContent[messageId] += content;
  updateMessage(messageId, streamContent[messageId], true);
}

function handleStreamComplete(messageId) {
  const finalContent = streamContent[messageId] || '';
  conversationHistory.push({ role: 'assistant', content: finalContent });
  delete streamContent[messageId];
}

function handleStreamError(messageId, error) {
  updateMessage(messageId, `错误：${error}`, false);
  delete streamContent[messageId];
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
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'ai-message-content';
  
  if (role === 'user') {
    contentDiv.textContent = content;
  } else {
    contentDiv.innerHTML = parseMarkdown(content);
  }
  
  messageDiv.appendChild(roleLabel);
  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
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
    
    const messagesContainer = sidebar.querySelector('#ai-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
      systemPrompt: '你是一个专业的助手，帮助用户理解和解释文本内容。',
      userPrompt: '请解释以下内容：\n\n{selectedText}'
    }, resolve);
  });
}
