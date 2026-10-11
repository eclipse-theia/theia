<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI EXTERNAL API EXTENSION</h2>

<hr />

</div>

## Description

This package exposes an HTTP API on the Theia backend that allows external tools
(control planes, dashboards, CLIs) to inspect the AI chat sessions of a running Theia
instance, to follow session changes as a push stream, to open or restore sessions in
the IDE, to send prompts to sessions, and to create new sessions.

Session data is provided live by the connected frontends: each frontend registers itself with
the backend and is queried on demand. Sessions that are restored (in memory) in a connected
frontend are reported with their full state; persisted sessions that have not been restored
are reported with their persisted metadata and `"restored": false`. If no frontend is
connected, the session list is empty. Sessions that an agent delegated to another agent are
listed alongside top-level ones and carry `parentSessionId` and `rootSessionId`, so consumers
can group them as the IDE's session list does.

Session *status* uses the aggregated per-session status of `ChatModel.status`
(`@theia/ai-chat`): `idle`, `running`, `awaitingApproval`, `awaitingToolCall`,
`awaitingInput`, or `failed`. Persisted sessions that are not restored report `failed` if
their last request ended in an error and `idle` otherwise.

### Enabling the API

The endpoints are contributed to the external API server of `@theia/external-api`, which is
disabled by default and configured through the `externalApi.*` user preferences (delivery
mode, port, hostname, and bearer token). See the `@theia/external-api` README for the
configuration and its security considerations.

### API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/ai/sessions` | List the sessions, most recently used first. |
| `POST /api/ai/sessions` | Create a session, optionally sending an initial prompt. |
| `GET /api/ai/sessions/events` | Follow the session list as server-sent events. |
| `GET /api/ai/sessions/:id` | Read one session including its conversation. |
| `POST /api/ai/sessions/:id/prompt` | Send a prompt to the session. |
| `POST /api/ai/sessions/:id/open` | Show the session in the chat view of a connected frontend. |
| `POST /api/ai/sessions/:id/restore` | Restore the session without focusing it. |

The endpoints, their request and response bodies, and their error responses are documented in
the [API reference](https://github.com/eclipse-theia/theia/blob/master/packages/ai-external-api/doc/api-reference.md).
The API also describes itself: all endpoints are published, with descriptions and schemas,
in the OpenAPI document served at `GET /api/openapi.json` (see `@theia/external-api`), e.g.
to generate clients or MCP tool definitions.

### Security Considerations

- Chat histories can contain sensitive workspace content. Configure an `externalApi.token`
  and mind the security considerations of `@theia/external-api`.
- The creation and prompt endpoints trigger agent execution: they start language model
  requests and, depending on the configured tool confirmation settings, tool calls in the
  user's IDE. Do not expose them without a token.
- The open and restore endpoints affect the IDE: opening raises the chat view in the user's
  frontend, creating switches the active session, and restoring loads persisted session data
  into memory.

## Additional Information

- [API documentation for `@theia/ai-external-api`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-external-api.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
