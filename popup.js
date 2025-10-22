document.addEventListener('DOMContentLoaded', loadConfig);

document.getElementById('config-form').addEventListener('submit', saveConfig);
document.getElementById('test-btn').addEventListener('click', testConnection);

async function loadConfig() {
  chrome.storage.sync.get({
    apiKey: '',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: '你是一个专业的助手，帮助用户理解和解释文本内容。',
    userPrompt: '请解释以下内容：\n\n{selectedText}'
  }, (config) => {
    document.getElementById('api-url').value = config.apiUrl;
    document.getElementById('api-key').value = config.apiKey;
    document.getElementById('model').value = config.model;
    document.getElementById('temperature').value = config.temperature;
    document.getElementById('max-tokens').value = config.maxTokens;
    document.getElementById('system-prompt').value = config.systemPrompt;
    document.getElementById('user-prompt').value = config.userPrompt;
  });
}

function saveConfig(e) {
  e.preventDefault();
  
  const config = {
    apiUrl: document.getElementById('api-url').value.trim(),
    apiKey: document.getElementById('api-key').value.trim(),
    model: document.getElementById('model').value.trim(),
    temperature: parseFloat(document.getElementById('temperature').value),
    maxTokens: parseInt(document.getElementById('max-tokens').value),
    systemPrompt: document.getElementById('system-prompt').value.trim(),
    userPrompt: document.getElementById('user-prompt').value.trim()
  };
  
  chrome.storage.sync.set(config, () => {
    showMessage('设置已保存！', 'success');
  });
}

async function testConnection() {
  const messageDiv = document.getElementById('message');
  const testBtn = document.getElementById('test-btn');
  
  testBtn.disabled = true;
  testBtn.textContent = '测试中...';
  
  try {
    const config = {
      apiUrl: document.getElementById('api-url').value.trim(),
      apiKey: document.getElementById('api-key').value.trim(),
      model: document.getElementById('model').value.trim(),
      temperature: parseFloat(document.getElementById('temperature').value),
      maxTokens: parseInt(document.getElementById('max-tokens').value)
    };
    
    if (!config.apiKey || !config.apiUrl) {
      throw new Error('请填写 API 密钥和接口地址');
    }
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "callOpenAI",
        apiConfig: config,
        messages: [
          { role: 'user', content: '你好，请回复"测试成功"' }
        ]
      }, (response) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error));
        }
      });
    });
    
    showMessage('连接测试成功！AI 回复: ' + response, 'success');
    
  } catch (error) {
    showMessage('连接测试失败: ' + error.message, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }
}

function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = `message show ${type}`;
  
  setTimeout(() => {
    messageDiv.classList.remove('show');
  }, 5000);
}
