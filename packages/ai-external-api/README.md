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
connected, the session list is empty.

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

A standalone, detailed API reference is available in
[docs/api-reference.md](docs/api-reference.md). The API also describes itself: all endpoints
are published — with descriptions and schemas — in the OpenAPI document served at
`GET /api/openapi.json` (see `@theia/external-api`), e.g. to generate clients or MCP tool
definitions.

#### `GET /api/ai/sessions`

Returns the list of chat sessions, most recently used first.

```json
{
  "sessions": [
    {
      "id": "d3f1…",
      "title": "Fix failing tests",
      "status": "awaitingApproval",
      "lastInteraction": 1751880000000,
      "workspace": "file:///home/user/project",
      "preview": "Tool call: runTests({})\nAll tests pass now.",
      "agentId": "Coder",
      "agentName": "Coder",
      "restored": true
    }
  ]
}
```

- `id`: unique session id.
- `title`: session title, if one has been set or generated (optional).
- `status`: aggregated session status, see above.
- `lastInteraction`: timestamp in milliseconds since epoch of the last interaction (optional).
- `workspace`: URI of the workspace the session belongs to (optional; absent when the
  session's frontend has no open workspace).
- `preview`: the last few lines of the conversation as plain text, newline-separated, with
  overlong lines truncated (optional; absent for an empty conversation and for sessions that
  are not restored).
- `agentId`: id of the agent driving the session (optional; absent when no agent is pinned).
- `agentName`: human-readable name of that agent (optional).
- `restored`: whether the session is restored in a connected frontend. Sessions with
  `"restored": false` report persisted metadata only.

#### `POST /api/ai/sessions`

Creates a new chat session in a connected frontend and optionally sends an initial prompt.

```json
{
  "workspace": "file:///home/user/project",
  "agentId": "Coder",
  "prompt": "Fix the failing tests",
  "focus": true
}
```

- `workspace` (optional): the session is created in a frontend that has this workspace open.
  May be omitted when all connected frontends share the same workspace; with several
  different workspaces open, omitting it is rejected as ambiguous.
- `agentId` (optional): agent to pin to the session; without it, the default agent handles
  prompts.
- `prompt` (optional): initial prompt to send right after creation.
- `focus` (optional): raise the chat view in the IDE. Note that the created session becomes
  the active session of its frontend in any case — an externally created session is expected
  to be the one the user wants to work on.

Returns `201` with the created session and, if an initial prompt was sent, the id of the
created request:

```json
{
  "session": { "id": "d3f1…", "status": "running", "restored": true, "…": "…" },
  "requestId": "a81c…"
}
```

Failures: `400 { "error": "unknown agent" }`, `404 { "error": "workspace not found" }`
(no connected frontend matches), `409 { "error": "ambiguous workspace" }`,
`409 { "error": "no agent available" }` (no agent — mentioned, pinned, or default — could
handle the initial prompt; the session is not kept in that case).

#### `POST /api/ai/sessions/:id/prompt`

Sends a prompt to the session, restoring it first if necessary.

```json
{ "text": "Also run the linter", "interrupt": false }
```

- `text`: the prompt, including optional `@agent` mentions and variable references.
- `interrupt` (optional): cancel an in-progress request (including pending tool calls) before
  sending. Without it, prompting a session whose status is in progress is rejected with
  `409 { "error": "busy" }`.

Returns `202` with the created request; follow the progress via the event stream or the read
endpoints:

```json
{ "sessionId": "d3f1…", "requestId": "a81c…" }
```

Failures: `404` for an unknown session, `409 { "error": "busy" }` (see above), and
`409 { "error": "no agent available" }` when no agent was found to handle the prompt.

#### `GET /api/ai/sessions/events`

Streams the session list as [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).
On connect, the stream immediately delivers the current list; afterwards, an updated list is
pushed whenever sessions change (created, deleted, renamed, or status changed). Bursts of
changes are coalesced, and comment lines are sent periodically to keep the connection alive.

```text
event: sessions
data: {"sessions":[…]}
```

Each event carries the full, current session list in the same format as `GET /api/ai/sessions`.

Note that when a token is configured, this endpoint requires the `Authorization` header like
all others. The browser `EventSource` API cannot send custom headers; use `fetch` with a
streaming body or an SSE client library instead.

#### `GET /api/ai/sessions/:id`

Returns the summary fields above plus the session's conversation for a single session, or
`404` if the session is unknown. For persisted sessions that are not restored, only the
summary fields are returned (no `messages`); restore the session to read its conversation.

```json
{
  "id": "d3f1…",
  "title": "Fix failing tests",
  "status": "idle",
  "lastInteraction": 1751880000000,
  "workspace": "file:///home/user/project",
  "preview": "Tool call: runTests({})\nAll tests pass now.",
  "agentId": "Coder",
  "agentName": "Coder",
  "restored": true,
  "messages": [
    { "actor": "user", "text": "Fix the failing tests" },
    { "actor": "ai", "text": "Tool call: runTests({})\n\nAll tests pass now." }
  ]
}
```

`messages` is the conversation reduced to plain text, oldest first, similar to the message
history sent to the language model for the next request: `actor` is `user` or `ai`, and
`text` renders each entry as plain text (tool calls as `Tool call: name(arguments)`,
thinking as `<Thinking>…</Thinking>`, errors as their message). Internal details such as
content ids, request branches, or serialization metadata are not exposed.

#### `POST /api/ai/sessions/:id/open`

Shows the session in the chat view of a connected frontend, restoring it first if necessary.
When several frontends know the session, the one with the restored (preferring in-progress)
session is chosen. Returns `204` on success and `404` if no connected frontend knows the
session.

#### `POST /api/ai/sessions/:id/restore`

Restores the session in a connected frontend without focusing it and returns the session
detail (including `messages`), or `404` if no connected frontend knows the session. Restoring
an already restored session is a no-op and returns its detail.

#### Error responses

- `400 { "error": "invalid request" }`: invalid or missing body fields; the validation
  messages are carried in a human-readable `details` array.
- `404 { "error": "not found" }`: unknown session id.
- `500 { "error": "internal error" }`: failed to gather session data or perform the action.

The creation and prompt endpoints additionally return the failure responses documented above.
The generic error responses of the external API server — `400` for malformed JSON, `401` for
a missing or invalid bearer token, `413` for too large request bodies — apply as documented
for `@theia/external-api`.

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
