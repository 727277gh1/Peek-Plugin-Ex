# AI Text Explanation Assistant - Browser Extension

## Project Overview

This is a fully-featured browser extension that enables users to explain selected text on web pages using AI through OpenAI-compatible APIs. The extension provides a modern, user-friendly interface with advanced features like streaming responses, Markdown rendering, and conversational AI interactions.

### Core Purpose
- Read and process web page content
- Allow users to select text they want explained
- Send selections to configurable OpenAI-compatible APIs
- Display AI explanations in a beautiful, interactive sidebar
- Enable continuous conversations with context awareness

### Key Features
- 🔧 **Configurable APIs**: Support for any OpenAI-compatible endpoint
- 🖱️ **Context Menu Integration**: Right-click menu integration for quick access
- 💬 **Smart Conversations**: Context-aware dialogue with AI
- ⚙️ **Custom Prompts**: Configurable system and user prompt templates
- 🌊 **Streaming Output**: Real-time AI response display (SSE protocol)
- 🧠 **Reasoning Chain**: Support for models with thinking processes (e.g., o1 models)
- 📝 **Markdown Rendering**: Rich formatting with code highlighting, tables, lists
- 📌 **Minimization**: Collapsible sidebar to avoid blocking content
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations

## Tech Stack

### Core Technologies
- **Chrome Extension Manifest V3**: Latest browser extension standard
- **Vanilla JavaScript**: No external dependencies, pure native implementation
- **CSS3**: Modern styling with animations and gradients
- **Chrome Extensions API**: Browser-specific APIs for extensions

### API Integration
- **OpenAI-compatible APIs**: Flexible API configuration
- **Server-Sent Events (SSE)**: For streaming responses
- **HTTPS**: All communications encrypted

### Supported Environments
- Chrome Browser
- Microsoft Edge
- Any Chromium-based browser with Manifest V3 support

## Project Structure

```
.
├── manifest.json           # Extension configuration (Manifest V3)
├── background.js           # Background service worker (handles context menu, messaging)
├── content.js              # Content script (injected into web pages, manages sidebar)
├── markdown.js             # Lightweight Markdown parser (no external dependencies)
├── sidebar.css             # Sidebar styling (modern gradient design)
├── popup.html              # Settings popup HTML
├── popup.css               # Settings popup styling
├── popup.js                # Settings popup logic (API configuration, testing)
├── icons/                  # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── test.html               # Test page for development
├── test-scroll.html        # Scrollbar testing page
├── test-overflow.html      # Overflow testing page
├── README.md               # User documentation (Chinese)
├── FEATURES.md             # Detailed feature documentation (Chinese)
├── MODEL_LIMITS.md         # Token limits for different AI models
├── SCROLLBAR_FIX.md        # Scrollbar implementation notes
├── OVERFLOW_FIX.md         # Overflow handling documentation
└── .gitignore              # Git ignore configuration
```

### Architecture

#### Background Script (`background.js`)
- Creates context menu items
- Listens for context menu clicks
- Manages communication between popup and content scripts
- Handles extension lifecycle events

#### Content Script (`content.js`)
- Injected into all web pages
- Manages sidebar creation and display
- Handles text selection
- Processes AI responses (streaming and non-streaming)
- Manages conversation history
- Handles minimize/maximize functionality

#### Popup (`popup.html`, `popup.js`, `popup.css`)
- Configuration interface for users
- API endpoint and key management
- Prompt template customization
- Feature toggles (streaming, reasoning chain)
- Connection testing

#### Markdown Parser (`markdown.js`)
- Lightweight, custom implementation
- No external dependencies
- Supports: headings, bold, italic, code blocks, lists, tables, links, quotes
- Optimized for AI responses

## Coding Standards

### JavaScript Style
- **No semicolons**: Follow the existing convention of omitting semicolons
- **Single quotes**: Use single quotes for strings
- **Indentation**: 2 spaces (consistent throughout the project)
- **No external dependencies**: Keep the extension lightweight and self-contained
- **Modern ES6+**: Use const/let, arrow functions, template literals, async/await
- **Comments**: Minimal comments; code should be self-documenting (Chinese comments where present)

### Naming Conventions
- **Variables**: camelCase (e.g., `selectedText`, `apiEndpoint`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `MAX_TOKENS`)
- **Functions**: camelCase, descriptive names (e.g., `sendMessageToAI`, `createSidebar`)
- **CSS classes**: kebab-case (e.g., `.ai-sidebar`, `.message-bubble`)

### Code Organization
- **Event Listeners**: Group related event listeners together
- **Functions**: Place helper functions after main logic
- **Storage Access**: Use `chrome.storage.local` for persistence
- **Error Handling**: Always handle API errors and network failures gracefully
- **Console Logging**: Use for debugging, prefix with script name

### CSS Conventions
- **Modern Properties**: Use flexbox, CSS Grid where appropriate
- **Animations**: Use CSS transitions and animations for smooth UX
- **Z-index**: High values (999999+) for sidebar to overlay web content
- **Variables**: Currently not using CSS variables, but consistent color scheme
- **Gradients**: Purple gradient theme (`#667eea` to `#764ba2`)

## API Integration

### Configuration Storage
All settings stored in `chrome.storage.local`:
- `apiEndpoint`: API URL
- `apiKey`: API authentication key
- `model`: Model identifier (e.g., `gpt-3.5-turbo`)
- `temperature`: Response randomness (0-2)
- `maxTokens`: Maximum response length
- `systemPrompt`: AI role definition
- `userPromptTemplate`: Template with `{selectedText}` placeholder
- `streamEnabled`: Boolean for streaming responses
- `reasoningEnabled`: Boolean for thinking chain

### API Request Format
Standard OpenAI Chat Completions format:
```javascript
{
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: model,
    messages: conversationHistory,
    temperature: temperature,
    max_tokens: maxTokens,
    stream: streamEnabled,
    reasoning_effort: reasoningEnabled ? 'high' : undefined
  })
}
```

### Streaming Implementation
- Uses Server-Sent Events (SSE)
- Processes `data: [DONE]` to detect completion
- Handles partial JSON chunks
- Accumulates content from `delta.content`

## Development Workflow

### Local Development Setup
1. Clone the repository
2. Open Chrome/Edge and navigate to extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project directory
6. Extension is now loaded and ready for testing

### Testing Strategy

#### Manual Testing
- **Test pages provided**: `test.html`, `test-scroll.html`, `test-overflow.html`
- Test text selection and right-click menu
- Verify sidebar appearance and positioning
- Test API connectivity with "Test Connection" button
- Verify streaming and non-streaming responses
- Test conversation continuity
- Check minimize/maximize functionality
- Test Markdown rendering with various formats

#### Debugging
- **Background Script**: Click "Service Worker" in extension details
- **Content Script**: Open DevTools on any web page, check Console
- **Popup**: Right-click extension icon → "Inspect popup"
- **Network**: Monitor network requests in DevTools Network tab

#### Common Issues to Test
- **Long text selections**: Verify token limits
- **Network failures**: Ensure graceful error handling
- **Multiple tabs**: Verify independent sidebar instances
- **Page navigation**: Check if sidebar persists/resets appropriately
- **API compatibility**: Test with different OpenAI-compatible providers

### Making Changes

#### Adding New Features
1. Update manifest.json if new permissions needed
2. Implement logic in appropriate script (background/content/popup)
3. Update UI if necessary (HTML/CSS)
4. Test thoroughly across different scenarios
5. Update documentation (README.md, FEATURES.md)

#### Modifying UI
1. Edit CSS files maintaining existing design language
2. Keep the purple gradient theme consistent
3. Ensure responsive design (different screen sizes)
4. Test z-index conflicts with various websites
5. Verify animations are smooth (60fps)

#### API Changes
1. Update request/response handling in content.js
2. Test with both streaming and non-streaming modes
3. Handle new error cases
4. Update configuration UI if needed
5. Document new parameters in README

### Version Management
- Update `version` in manifest.json following semantic versioning
- Document changes in FEATURES.md or similar
- Tag releases in git

## Browser Extension Best Practices

### Security
- **Never expose API keys**: Store securely in chrome.storage.local
- **Content Security Policy**: Follow manifest.json CSP guidelines
- **HTTPS only**: All API communications over HTTPS
- **Input sanitization**: Always sanitize user input and selected text
- **XSS prevention**: Be cautious with innerHTML, prefer textContent or proper escaping

### Performance
- **Lazy loading**: Don't initialize sidebar until needed
- **Event delegation**: Use efficient event handling
- **DOM manipulation**: Minimize reflows and repaints
- **Memory management**: Clean up event listeners when removing elements
- **Streaming benefits**: Reduces perceived latency

### User Experience
- **Non-intrusive**: Sidebar only appears when invoked
- **Responsive**: Fast response to user actions
- **Error messages**: Clear, helpful error messages in Chinese
- **Loading states**: Show loading indicators during API calls
- **Smooth animations**: 60fps transitions

### Compatibility
- **Manifest V3**: Follow V3 requirements (service workers, not background pages)
- **Permissions**: Request minimal necessary permissions
- **Host permissions**: Use `<all_urls>` carefully, document why needed
- **Cross-browser**: Test on Chrome and Edge

## Common Development Commands

### Loading/Reloading Extension
- After code changes, click the refresh icon on the extension card
- Or use the keyboard shortcut on the extensions page
- Content script changes require page reload
- Background script changes require extension reload

### Debugging Console Access
```javascript
// In content script (web page console):
console.log('Content script:', data)

// In background script (Service Worker console):
console.log('Background:', data)

// In popup (popup inspector console):
console.log('Popup:', data)
```

## Configuration Examples

### OpenAI Official
```
API Endpoint: https://api.openai.com/v1/chat/completions
API Key: sk-your-api-key-here
Model: gpt-3.5-turbo
```

### Azure OpenAI
```
API Endpoint: https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2023-05-15
API Key: your-azure-api-key
Model: gpt-35-turbo
```

### Local LLM (Ollama, LocalAI)
```
API Endpoint: http://localhost:11434/v1/chat/completions
API Key: (may not be required)
Model: llama2
```

## Token Limits Reference

| Model | Total Limit | Recommended Max Tokens |
|-------|-------------|------------------------|
| GPT-3.5-turbo | 4,096 | 2,000 |
| GPT-4 | 8,192 | 4,000 |
| GPT-4-turbo | 128,000 | 64,000 |
| Claude-3 | 200,000 | 100,000 |
| Gemini-1.5-pro | 1,048,576 | 500,000 |

**Note**: Total tokens = Input tokens + Output tokens. Recommended max tokens is 50-70% of total limit.

## Future Development Considerations

### Potential Enhancements
- Multi-language support (currently Chinese, could add English UI)
- Theme customization (dark/light modes, custom colors)
- Export conversation history
- Offline mode with cached responses
- Voice input/output
- Image/screenshot explanation
- Custom keyboard shortcuts
- Multiple conversation threads
- Search within conversation history

### Known Limitations
- Sidebar may conflict with some websites using high z-index
- Content Security Policy on some sites may block sidebar injection
- Streaming requires API support (not all providers support SSE)
- No persistent conversation history across browser restarts

## Related Documentation

- **README.md**: Main user documentation (Chinese)
- **FEATURES.md**: Detailed feature explanations (Chinese)
- **MODEL_LIMITS.md**: Token limits for various AI models
- **SCROLLBAR_FIX.md**: Technical notes on scrollbar implementation
- **OVERFLOW_FIX.md**: Solutions for content overflow issues

## Support and Contribution

- Report issues via GitHub Issues
- Submit Pull Requests following existing code style
- Maintain Chinese language in user-facing documentation
- Update both code and documentation together
- Test thoroughly before submitting changes

---

**Note for AI Assistants**: This project is a fully implemented, production-ready browser extension. When making changes, always maintain backward compatibility, follow the existing code style (no semicolons, single quotes, 2-space indentation), and test thoroughly. The project uses no external dependencies - keep it that way for simplicity and security.
