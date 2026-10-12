<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - CHATGPT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-chatgpt` extension serves models through your ChatGPT subscription instead of an OpenAI API key.
The user setting `ai-features.chatGpt.authenticationMode` selects **`codex` (default)**, the legacy Codex authentication, or **`oss`**, OpenAI's official OSS token-sharing flow.
The models appear as `chatgpt/<model>` in the model picker and coexist with the API-key based `openai/<model>` models contributed by `@theia/ai-openai`.

By default the models your ChatGPT plan grants are queried from the endpoint once you are signed in. Set the `ai-features.chatGpt.modelOverrides`
preference to offer a fixed list of models instead. A built-in list is offered when authenticated discovery fails, for example when the
endpoint cannot be reached. Discovery returns no models without credentials or sharing permission, or when the API rejects access or reports an exhausted budget.

### Selecting an authentication mode

Codex uses OpenAI Codex CLI's public OAuth registration (`app_EMoamEEZ73f0CkXaXp7hrann`), authorization at
`https://auth.openai.com/oauth/authorize`, and exchange/refresh at `https://auth.openai.com/oauth/token`.
The callback is `http://localhost:1455/auth/callback`. Use the ChatGPT status bar or _ChatGPT: Sign in_; when the
callback cannot reach the backend, paste the redirect URL or bare authorization code. Inference uses the experimental,
undocumented `https://chatgpt.com/backend-api/codex/responses` endpoint; discovery uses its `/models?client_version=1.0.0`
catalog and requires `supported_in_api: true` and `visibility: 'list'`. This client registration belongs to OpenAI, not Theia.
Adopters must assess its suitability; neither the legacy endpoints nor this integration carry a stability guarantee.

Changing modes cancels pending sign-in, clears model discovery, and invalidates credentials pinned to in-flight request/tool cycles,
even if the mode is subsequently switched back. Already-sent responses may finish; subsequent calls cannot cross endpoints.
Only one account can be signed in at a time across both modes. Changing modes signs out and forgets the previous session;
switching back requires a new login. To change accounts in either mode, run _ChatGPT: Sign out_, then _ChatGPT: Sign in_.
All frontends connected to one backend share the current mode and session; use separate backends for independent users.

The OSS session uses the existing `default` key-store account; Codex uses `default:codex` (under `theia-chatgpt` by default).
Single-account Codex credentials stored by Theia 1.77 are imported into the Codex slot only when that slot is absent; the original slot
is left unchanged. Signing out writes a disconnected marker, so those legacy credentials cannot be imported again.
An OSS session is never imported into Codex, and legacy credentials are never accepted by OSS.

### Signing in with official OSS token sharing

Click the ChatGPT status bar item or run _ChatGPT: Sign in_. The authorization page identifies the application and asks you to enable
ChatGPT token sharing. First-time sign-in uses the OSS dynamic-client bootstrap; OpenAI returns the concrete client ID in the callback.
Theia requests `resource=https://api.openai.com/v1` and validates the ID token. The current account registration is retained for reconnects
until you sign out or change authentication modes.
No pre-issued Codex CLI client ID is used. Authorization starts at `https://auth.openai.com/api/accounts/authorize` with
`client_id=dynamic_agent_client`. Code exchange and refresh use `https://auth.openai.com/api/accounts/oauth/token`.

The browser returns to `http://127.0.0.1:1455/auth/callback`, served by the Theia backend. If the backend is remote or the port is in use,
paste the **full redirect URL** into Theia. The first sign-in must include the issued client ID; reconnects can reuse the saved ID when the
callback omits it. A bare authorization code is insufficient for this flow.
OAuth access, refresh and verified ID tokens are stored in the operating system's credential store. The returned OAuth access token
is the bearer for model requests when both `chatgpt.tokens.use.direct` and `resource.invoke` are granted. Access and refresh tokens
never cross frontend RPC. Reconnect authorization URLs may carry a previously verified ID-token hint; signing out clears that hint.

To use another account, run _ChatGPT: Sign out_, then _ChatGPT: Sign in_. There is no saved-account picker or simultaneous login.
Signing out removes the local credentials, account registration and ID-token hint before another login can start, and attempts
remote token revocation using the discovered endpoint. The stable application host ID is retained. The next OSS login starts
with the dynamic-client bootstrap again; the client ID is a backend OAuth detail, not an account-switching control.

Models are registered only while the current account is connected and has token-sharing permission. The status bar identifies the current
account or reports disabled token sharing. Access tokens are renewed near expiry; refresh includes `resource=https://api.openai.com/v1`,
omits `scope`, and retains the latest replacement refresh token. Requests consume your ChatGPT token-sharing budget, not OpenAI API-key credits.
All frontends attached to one backend share the current session; different users must use separate backend credential stores.
Set `ai-features.chatGpt.enabled` to `false` to disable the provider, remove its models and hide its status bar item; the configured model list is preserved.

### Backend application configuration (OSS)

The application name hint defaults to Theia. Adopters should supply their own name so users can identify the application on OpenAI's
authorization page. The current session's client ID is issued by OpenAI, rather than configured as a static Codex CLI registration.

Application authors can rebind `ChatGptAuthServiceConfig` from `@theia/ai-chatgpt/lib/node/chatgpt-auth-service` in a backend module
loaded after this extension. These are backend DI values, not frontend preferences. All fields are required; spread
`DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG` to override only selected values:

```typescript
import { ContainerModule } from '@theia/core/shared/inversify';
import { ChatGptAuthServiceConfig, DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG } from '@theia/ai-chatgpt/lib/node/chatgpt-auth-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(ChatGptAuthServiceConfig).toConstantValue({
        ...DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG,
        agentName: 'Your application',
        keyStoreService: 'your-application-chatgpt'
    });
});
```

| Field | Default |
| --- | --- |
| `agentName` | `Theia` |
| `callbackHost` | `127.0.0.1` |
| `callbackPort` | `1455` |
| `callbackPath` | `/auth/callback` |
| `keyStoreService` | `theia-chatgpt` |
| `keyStoreAccount` | `default` |

The redirect URI is derived as `http://<callbackHost>:<callbackPort><callbackPath>` and is used consistently for authorization,
code exchange and the loopback listener. OpenAI requires the HTTP loopback host `127.0.0.1`; `localhost` and `::1` are not accepted.
The scheme, host and callback path must match the saved client's registration on reconnect; only the port may vary.
Changing key store identifiers selects a different credential store and does not migrate existing credentials.

For Codex, rebind `ChatGptCodexAuthServiceConfig` from `@theia/ai-chatgpt/lib/node/chatgpt-codex-auth-service`.
It has the same fields plus `clientId`; its defaults derive from the OSS config but use the legacy client ID, `localhost`,
and a `:codex` suffix on `keyStoreAccount`. A custom client must use its registered redirect URI. Changing these identifiers
selects a different credential store; only the default suffix convention supports importing credentials stored by Theia 1.77.

Backend consumers use the `ChatGptBackendAuthService` interface symbol from the same module, which application authors can rebind
for a custom auth implementation. The frontend RPC service remains a narrow facade: it never exposes credentials or backend client registration.

### Migrating from Theia 1.77

`ChatGptAuthServiceConfig` now configures OSS authentication and requires `agentName` instead of a fixed `clientId`.
Applications that previously supplied a custom Codex client ID or callback host through that binding must move those overrides
to `ChatGptCodexAuthServiceConfig`. The default Codex configuration inherits shared fields, such as key-store identifiers,
from `ChatGptAuthServiceConfig`.
Codex OAuth constants and helpers previously exported by `chatgpt-oauth` now live in `chatgpt-codex-oauth`;
`chatgpt-oauth` describes the OSS protocol instead.

Custom auth implementations must support parameterless `startLogin` and login operations bound to its returned `loginId`.
Signing out forgets the current session and registration; there are no account-list or account-selection RPC methods.
Backend implementations also implement `setAuthenticationMode`, signing out the previous mode on changes;
individual protocol sessions use `ChatGptBackendAuthSession` instead.
Backend credentials include the mode's OAuth `clientId` (fixed for Codex, issued by OpenAI for OSS) and a session identity
that remains stable through refresh and changes on reconnect. The frontend does not select accounts or client IDs.
`ChatGptModel` takes separate `oss` and `codex` Responses utility instances; its `initializeOpenAi` hook receives the selected credentials.

### Cache affinity

Inference requests send a stable `session-id` for cache affinity and the current chat's `thread-id`.
Delegated chats use their immediate parent's session ID for cache affinity while keeping their own thread ID.
`x-client-request-id` uses the language model subrequest ID when available, otherwise the chat request ID.
These headers are retained during tool cycles and SDK retries; credentials are still checked and refreshed before sending.
They are cache hints, not a guarantee of cache hits, and do not change authorization or organization access policy.
Codex additionally sends its legacy `chatgpt-account-id`, `OpenAI-Beta: responses=experimental`, `originator: theia`,
and `session_id` headers; OSS never receives these account-routing headers.

### Server-side compaction

ChatGPT models request automatic server-side compaction through the Responses API `context_management` directive.
`ai-features.chatGpt.serverSideCompaction` defaults to `default`, inheriting the global chat compaction setting; `enabled`
and `disabled` override it. The optional `ai-features.chatGpt.serverSideCompactionTokenThreshold` overrides the global
input-token threshold. When neither is set, the provider chooses the threshold. Session compaction settings take precedence.
Responses remain unstored and streamed; encrypted compaction state returned in the stream is replayed on subsequent ChatGPT requests.
OSS uses `chatgpt-oss-responses`; Codex uses `chatgpt-responses`. Both are distinct from OpenAI's `openai-responses` marker. Foreign encrypted state is not replayed; available earlier text history is retained instead.

### Limitations

In OSS mode, this integration follows OpenAI's [OSS token-sharing preview](https://developers.openai.com/siwc/token-sharing-open-source).
The preview requires an eligible subscription, enabled sharing and available budget. It is not general access to every OpenAI model or API.
Open-source/local applications and self-hosted deployments should follow the applicable OpenAI documentation; paid or managed hosted offerings
have a separate onboarding path. Open-source licensing alone does not establish eligibility for every deployment.

In OSS mode, inference uses `https://api.openai.com/v1/responses`; discovery uses `/v1/models`. Theia keeps responses streamed and unstored and offers only
models marked `visibility: 'list'` by the selected account's
[token-sharing catalog](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), using each model's `slug`.
Manually configured models must be granted to the selected account. Budget and incomplete/failed stream responses are surfaced as
request failures, not silently treated as successful answers. API-key OpenAI models remain separate.

Encrypted compaction state is never replayed across modes. The shared Responses tool schema and unrestricted request settings
may not match all OSS preview restrictions.

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
