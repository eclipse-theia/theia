<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - CHATGPT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-chatgpt` extension serves models through your ChatGPT subscription instead of an OpenAI API key.
`ai-features.chatGpt.authenticationMode` selects **`codex` (default)**, the legacy Codex authentication, or **`oss`**, OpenAI's official OSS token-sharing flow.
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
Codex retains its single replaceable account; the multi-account registration flow below applies to OSS.

Changing modes cancels pending sign-in, clears model discovery, and invalidates credentials pinned to in-flight request/tool cycles,
even if the mode is subsequently switched back. Already-sent responses may finish; subsequent calls cannot cross endpoints.
Credentials and accounts are preserved separately, so switching back restores that mode's account without requiring another login.
Signing out affects only the selected mode/account. All frontends connected to one backend share the current mode (the most recent
preference update wins); use separate backends for independent users or selections.

OSS accounts stay in the existing `default` key-store account; Codex uses `default:codex` (under `theia-chatgpt` by default).
HEAD's old single-account Codex credential record is imported into the Codex slot only when that slot is absent; the original slot
is left unchanged. An OSS registry is never imported into Codex, and legacy credentials are never accepted by OSS.

### Signing in with official OSS token sharing

Click the ChatGPT status bar item or run _ChatGPT: Sign in_. The authorization page identifies the application and asks you to enable
ChatGPT token sharing. First-time sign-in uses the OSS dynamic-client bootstrap; OpenAI returns the concrete client ID in the callback.
Theia requests `resource=https://api.openai.com/v1`, validates the ID token and retains the account registration for later reconnects.
No pre-issued Codex CLI client ID is used. Authorization starts at `https://auth.openai.com/api/accounts/authorize` with
`client_id=dynamic_agent_client`. Code exchange and refresh use `https://auth.openai.com/api/accounts/oauth/token`.

The browser returns to `http://127.0.0.1:1455/auth/callback`, served by the Theia backend. If the backend is remote or the port is in use,
paste the **full redirect URL** into Theia. The first sign-in must include the issued client ID; reconnects can reuse the saved ID when the
callback omits it. A bare authorization code is insufficient for this flow.
OAuth access, refresh and verified ID tokens are stored in the operating system's credential store. The returned OAuth access token
is the bearer for model requests when both `chatgpt.tokens.use.direct` and `resource.invoke` are granted. Access and refresh tokens
never cross frontend RPC. Reconnect authorization URLs may carry a previously verified ID-token hint; signing out clears that hint.

Run _ChatGPT: Switch account_ to select a retained account or connect another one. Reconnecting a known account reuses its issued client ID;
it does not create another registration. _ChatGPT: Sign out_ uses the discovered revocation endpoint and removes the selected account's local token set,
but retains its registration and the stable application host ID. Other connected accounts are preserved.

Models are registered only while the selected account is connected and has token-sharing permission. The status bar identifies the selected
account or reports disabled token sharing. Access tokens are renewed near expiry; refresh includes `resource=https://api.openai.com/v1`,
omits `scope`, and retains the latest replacement refresh token. Requests consume your ChatGPT token-sharing budget, not OpenAI API-key credits.
All frontends attached to one backend share the selected account; different users must use separate backend credential stores.
Set `ai-features.chatGpt.enabled` to `false` to disable the provider, remove its models and hide its status bar item; the configured model list is preserved.

### Backend application configuration (OSS)

The application name hint defaults to Theia. Adopters should supply their own name so users can identify the application on OpenAI's
authorization page. Client IDs are issued and retained per account, rather than configured as a static Codex CLI registration.

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
Changing key store identifiers selects a different account registry and does not migrate existing credentials.

For Codex, rebind `ChatGptCodexAuthServiceConfig` from `@theia/ai-chatgpt/lib/node/chatgpt-codex-auth-service`.
It has the same fields plus `clientId`; its defaults derive from the OSS config but use the legacy client ID, `localhost`,
and a `:codex` suffix on `keyStoreAccount`. A custom client must use its registered redirect URI. Changing these identifiers
selects a different credential store; only the default suffix convention supports importing HEAD's legacy single-account record.

Backend consumers use the `ChatGptBackendAuthService` interface symbol from the same module, which application authors can rebind
for a custom auth implementation. The frontend RPC service remains a narrow facade: it never exposes credentials or backend client registration.

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
models marked `visibility: 'list'` by the selected account's catalog. Manually configured models must be granted to the selected account. Budget and incomplete/failed stream responses
are surfaced as request failures, not silently treated as successful answers. API-key OpenAI models remain separate.

Earlier incompatible OSS token formats are not usable. Sign in again in OSS mode to create a verified session;
incompatible stored tokens are never sent to the public API. Encrypted compaction state is never replayed across modes.
The inherited Responses tool schema and unrestricted request settings may not match all OSS preview restrictions; those pre-existing
interoperability limitations remain unchanged by the mode selector.
Real OAuth consent, model inference and compaction on the new endpoint still require live validation; automated tests use mocked endpoints.

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
