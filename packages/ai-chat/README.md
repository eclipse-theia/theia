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

## Tool Context Patterns

When implementing tool handlers, there are two patterns depending on whether your tool requires chat-specific features:

### Generic Tools (no chat dependency)

For tools that only need basic context like cancellation support:

```typescript
import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';

@injectable()
export class MyGenericTool implements ToolProvider {
    getTool(): ToolRequest {
        return {
            id: 'myTool',
            name: 'myTool',
            description: 'A generic tool',
            parameters: { type: 'object', properties: {} },
            handler: async (args: string, ctx?: ToolInvocationContext) => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled' });
                }
                // Tool implementation
                return 'result';
            }
        };
    }
}
```

### Chat-Bound Tools (requires chat session)

For tools that need access to the chat session, request model, or response:

```typescript
import { assertChatContext, ChatToolContext } from '@theia/ai-chat';
import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';

@injectable()
export class MyChatTool implements ToolProvider {
    getTool(): ToolRequest {
        return {
            id: 'myChatTool',
            name: 'myChatTool',
            description: 'A chat-bound tool',
            parameters: { type: 'object', properties: {} },
            handler: async (args: string, ctx?: ToolInvocationContext) => {
                assertChatContext(ctx); // Throws if not in chat context
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled' });
                }
                // Access chat-specific features
                const sessionId = ctx.request.session.id;
                ctx.request.session.changeSet.addElements(...);
                return 'result';
            }
        };
    }
}
```

The `assertChatContext()` function serves as both a runtime validator and TypeScript type guard, ensuring the context is a `ChatToolContext` with `request` and `response` properties.

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
