<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI CHAT UI EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-chat-ui` extension contributes the `AI Chat` view.\
The `AI Chat view` can be used to easily communicate with a language model.

It is based on `@theia/ai-chat`.

## Custom Tool Renderers

To create a specialized renderer for a specific tool, implement the `ChatResponsePartRenderer` interface with a higher priority than the default `ToolCallPartRenderer` (priority `10`):

```typescript
@injectable()
export class MyToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {
    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response) && response.name === 'my_tool_id') {
            return 15;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        // Custom rendering logic
    }
}
```

For custom confirmation UIs, use the `ToolConfirmationActions` component to reuse the standard Allow/Deny buttons with dropdown options:

```typescript
import { ToolConfirmationActions } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer/tool-confirmation';

<ToolConfirmationActions
    toolName="my_tool"
    toolRequest={toolRequest}
    onAllow={(mode) => response.confirm()}
    onDeny={(mode) => response.deny()}
/>
```

## Additional Information

- [API documentation for `@theia/ai-chat-ui`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-chat-ui.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
