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
    
    chrome.tabs.sendMessage(tab.id, {
      action: "openSidebar",
      selectedText: selectedText
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callOpenAI") {
    callOpenAI(request.apiConfig, request.messages)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function callOpenAI(apiConfig, messages) {
  const response = await fetch(apiConfig.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: messages,
      temperature: apiConfig.temperature || 0.7,
      max_tokens: apiConfig.maxTokens || 2000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
