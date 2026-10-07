<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - CHATGPT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-chatgpt` extension serves OpenAI models through your ChatGPT subscription instead of an OpenAI API key.
The models appear as `chatgpt/<model>` in the model picker and coexist with the API-key based `openai/<model>` models contributed by `@theia/ai-openai`.

By default the models your ChatGPT plan grants are queried from the endpoint once you are signed in. Set the `ai-features.chatGpt.modelOverrides`
preference to offer a fixed list of models instead. A built-in list is offered when authenticated discovery fails, for example when the
endpoint cannot be reached. Discovery returns no models without credentials.

### Signing in

Click the ChatGPT status bar item or run the command _ChatGPT: Sign in_. It opens the OpenAI authorization
page in your browser. The browser returns the authorization code to a
listener on `http://localhost:1455/auth/callback`, which is provided by the Theia backend. If the backend does not run on the same machine as
your browser, or the port is already in use, you can paste the authorization code (or the full redirect URL) into the input box Theia offers
instead. The credentials are stored in the credential store of your operating system and are removed again by the command _ChatGPT: Sign out_.

Models are only registered while signed in. The status bar shows the signed-in account and provides a sign-out action.
Set `ai-features.chatGpt.enabled` to `false` to disable the provider, remove its models and hide its status bar item; the configured model list is preserved.

### Backend application configuration

The default OAuth client id `app_EMoamEEZ73f0CkXaXp7hrann` belongs to OpenAI's Codex CLI; it is not a client registered by Theia.
Adopters must evaluate whether using this client and the subscription endpoint is suitable for their application.
They can rebind the configuration below to use their own registered OAuth client and matching callback configuration.

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

### Server-side compaction

ChatGPT models request automatic server-side compaction through the Responses API `context_management` directive.
`ai-features.chatGpt.serverSideCompaction` defaults to `default`, inheriting the global chat compaction setting; `enabled`
and `disabled` override it. The optional `ai-features.chatGpt.serverSideCompactionTokenThreshold` overrides the global
input-token threshold. When neither is set, the provider chooses the threshold. Session compaction settings take precedence.
Responses remain unstored and streamed; encrypted compaction state returned in the stream is replayed on subsequent requests.

### Limitations

This integration is experimental and relies on an undocumented endpoint. There is no stability guarantee: OpenAI may change or
remove endpoint access, authentication requirements, or supported features without notice, causing the integration to stop working.
Adopters should evaluate these risks and the suitability of this integration before including it in their applications.

Requests are served by the ChatGPT endpoint `https://chatgpt.com/backend-api/codex`. That endpoint only supports the streaming Response API,
does not retain responses, and only serves the models included in your ChatGPT plan, so models configured by hand need to be available for
your plan.

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
