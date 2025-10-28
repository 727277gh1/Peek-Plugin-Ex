# 扩展在受限页面无法运行的问题修复

## 问题描述

扩展在以下类型的页面无法显示和运行：
- 浏览器内部页面（`chrome://`, `edge://`, `about:` 等）
- 其他扩展的页面（`chrome-extension://`）
- 浏览器错误页面（如 ERR_NAME_NOT_RESOLVED）
- Chrome Web Store / Edge Add-ons 商店页面
- 新标签页（某些情况下）
- 本地文件页面（`file://`）

## 原因分析

这是浏览器的安全限制，不是扩展的 bug。出于安全考虑，浏览器禁止内容脚本（content scripts）在特殊页面上运行，以防止恶意扩展：

1. 窃取浏览器敏感数据
2. 修改其他扩展的行为
3. 干扰浏览器核心功能
4. 访问受保护的系统资源

即使在 `manifest.json` 中声明了 `<all_urls>` 权限，浏览器仍会阻止在这些页面执行内容脚本。这是 Chrome、Edge 等浏览器的标准安全策略。

## 解决方案

### 1. URL 检测和友好提示

在 `background.js` 中添加了 `isRestrictedUrl()` 函数，用于检测当前页面是否是受限页面：

```javascript
function isRestrictedUrl(url) {
  if (!url) return true;
  
  const restrictedPatterns = [
    /^chrome:\/\//,           // Chrome 内部页面
    /^edge:\/\//,             // Edge 内部页面
    /^about:/,                // About 页面
    /^chrome-extension:\/\//, // 其他扩展页面
    /^extension:\/\//,        // 扩展页面（通用）
    /^file:\/\//,             // 本地文件
    /^view-source:/,          // 查看源代码页面
    /^data:/,                 // Data URLs
    /^javascript:/,           // JavaScript URLs
    /chrome\.google\.com\/webstore/,  // Chrome 网上应用店
    /microsoftedge\.microsoft\.com\/addons/  // Edge 扩展商店
  ];
  
  return restrictedPatterns.some(pattern => pattern.test(url));
}
```

### 2. 通知提示

当用户在受限页面尝试使用扩展时，会显示友好的通知消息，说明原因：

- **受限页面**：提示"浏览器不允许扩展在此类页面运行（浏览器内部页面、扩展页面或错误页面）"
- **注入失败**：提示"无法在当前页面使用扩展。请尝试刷新页面或在其他网页使用"

### 3. 添加权限

在 `manifest.json` 中添加了 `notifications` 权限，以支持显示通知：

```json
"permissions": [
  "contextMenus",
  "activeTab",
  "storage",
  "scripting",
  "notifications"
]
```

## 用户指南

如果您在某个页面无法使用此扩展，请尝试：

1. **确认页面类型**：查看地址栏，如果 URL 以 `chrome://`、`edge://`、`about:` 或 `chrome-extension://` 开头，则扩展无法在此页面工作。

2. **切换到普通网页**：扩展可以在所有普通网页上正常工作，包括：
   - HTTP/HTTPS 网页
   - 大多数公开网站

3. **刷新页面**：如果在普通网页上仍无法使用，尝试刷新页面（F5 或 Ctrl+R）。

4. **查看通知**：当扩展无法运行时，会显示桌面通知说明原因。

## 技术细节

### 为什么不能绕过这个限制？

这是浏览器的核心安全机制，无法通过任何方式绕过：

1. **API 限制**：`chrome.scripting.executeScript()` API 在受限页面会直接失败
2. **Content Scripts 过滤**：浏览器会在加载时过滤掉受限页面，不执行内容脚本
3. **权限边界**：即使声明最高权限，浏览器也会强制执行这些限制

### 其他浏览器的行为

所有基于 Chromium 的浏览器（Chrome、Edge、Brave 等）都有相同的限制。Firefox 也有类似的安全策略，只是 URL 方案略有不同（如 `about:` 页面）。

## 代码变更

### background.js
- 添加 `isRestrictedUrl()` 函数检测受限 URL
- 在 `contextMenus.onClicked` 中添加预检查
- 在 `ensureContentScriptLoaded()` 中添加额外验证
- 添加错误通知机制

### manifest.json
- 添加 `notifications` 权限

## 测试方法

1. 在普通网页上测试扩展功能 → 应该正常工作
2. 在 `chrome://extensions/` 页面尝试使用 → 显示限制通知
3. 在其他扩展页面尝试使用 → 显示限制通知
4. 在错误页面（断网后访问网站）尝试使用 → 显示限制通知

## 结论

通过添加受限 URL 检测和友好的用户通知，用户现在可以清楚地了解为什么扩展在某些页面无法工作，而不是遇到静默失败或混淆的错误消息。这提高了用户体验，减少了对扩展"不工作"的误解。
