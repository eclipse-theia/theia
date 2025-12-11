<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI CHAT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-chat` extension provides the concept of a language model chat to Theia.
It serves as the basis for `@theia/ai-chat-ui` to provide the Chat UI.

## Features

### Budget-Aware Tool Loop (Experimental)

When enabled via the `ai-features.chat.experimentalBudgetAwareToolLoop` preference, the chat system can automatically trigger conversation summarization when the token budget is exceeded during tool call loops. This prevents "context too long" API errors during complex multi-tool tasks.

**How it works:**
1. When a chat request includes tools, the system manages the tool loop externally instead of letting the language model handle it internally
2. Between tool call iterations, the system checks if the token budget is exceeded
3. If exceeded, it triggers summarization to compress the conversation history
4. The task continues with the summarized context plus the pending tool calls

**Requirements:**
- Currently only supports Anthropic models (other models fall back to standard behavior)
- Requires the language model to support the `singleRoundTrip` request property

**Preference:**

```json
{
  "ai-features.chat.experimentalBudgetAwareToolLoop": true
}
```

## Additional Information

- [API documentation for `@theia/ai-chat`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-chat.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
