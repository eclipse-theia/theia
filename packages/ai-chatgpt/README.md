<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - CHATGPT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-chatgpt` extension serves OpenAI models through your ChatGPT subscription instead of an OpenAI API key.
The models appear as `chatgpt/<model>` in the model picker and coexist with the API-key based `openai/<model>` models contributed by `@theia/ai-openai`.

By default the models your ChatGPT plan grants are queried from the endpoint once you are signed in. Set the `ai-features.chatGpt.models`
preference to offer a fixed list of models instead. A built-in list is offered when authenticated discovery fails, for example when the
endpoint cannot be reached. Discovery returns no models without credentials.

### Signing in

Click the ChatGPT status bar item, run the command _ChatGPT: Sign in_, or use the sign in link in the AI Configuration view. It opens the OpenAI authorization
page in your browser. The browser returns the authorization code to a
listener on `http://localhost:1455/auth/callback`, which is provided by the Theia backend. If the backend does not run on the same machine as
your browser, or the port is already in use, you can paste the authorization code (or the full redirect URL) into the input box Theia offers
instead. The credentials are stored in the credential store of your operating system and are removed again by the command _ChatGPT: Sign out_.

Models are only registered while signed in. The status bar shows the signed-in account and provides a sign-out action.
Set `ai-features.chatGpt.enabled` to `false` to disable the provider, remove its models and hide its status bar item; the configured model list is preserved.

### Backend application configuration

Application authors can rebind `ChatGptAuthServiceConfig` from `@theia/ai-chatgpt/lib/node/chatgpt-auth-service` in a backend module
loaded after this extension. These are backend DI values, not frontend preferences. All fields are required; spread
`DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG` to override only selected values:

```typescript
import { ContainerModule } from '@theia/core/shared/inversify';
import { ChatGptAuthServiceConfig, DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG } from '@theia/ai-chatgpt/lib/node/chatgpt-auth-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(ChatGptAuthServiceConfig).toConstantValue({
        ...DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG,
        clientId: 'your-registered-client-id',
        keyStoreService: 'your-application-chatgpt'
    });
});
```

| Field | Default |
| --- | --- |
| `clientId` | `app_EMoamEEZ73f0CkXaXp7hrann` |
| `callbackHost` | `localhost` |
| `callbackPort` | `1455` |
| `callbackPath` | `/auth/callback` |
| `keyStoreService` | `theia-chatgpt` |
| `keyStoreAccount` | `default` |

The redirect URI is derived as `http://<callbackHost>:<callbackPort><callbackPath>` and is used consistently for authorization,
code exchange and the loopback listener. Supply a hostname or unbracketed IP address, a fixed port and an absolute callback path.
The client and redirect URI must match an OpenAI OAuth registration; changing local values does not register a new callback.
Changing key store identifiers selects a different credential entry and does not migrate existing credentials.

Backend consumers use the `ChatGptBackendAuthService` interface symbol from the same module, which application authors can rebind
for a custom auth implementation. The frontend RPC service remains a narrow facade: it never exposes credentials or backend client registration.

### Limitations

Requests are served by the ChatGPT endpoint `https://chatgpt.com/backend-api/codex`. That endpoint only supports the streaming Response API,
does not retain responses, and only serves the models included in your ChatGPT plan, so models configured by hand need to be available for
your plan. Because responses are not retained, server-side compaction is not offered for these models. The endpoint is not documented, so
neither the web search tool it offers nor the listing of the granted models is a contract: web search can be deselected again in the chat
capabilities, and the model listing is treated as a hint.

## Additional Information

- [API documentation for `@theia/ai-chatgpt`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-chatgpt.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
