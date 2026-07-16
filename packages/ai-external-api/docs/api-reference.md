# Theia AI External API — Session API

HTTP API for inspecting, following, opening, prompting, and creating the AI chat sessions of a running Theia instance. Contributed by `@theia/ai-external-api` to the external API server of `@theia/external-api`.

**Availability:** disabled by default. Enabled via the `externalApi.delivery` preference — `samePort` (served on the main Theia port) or `separatePort` (served on `externalApi.port`). If `externalApi.token` is configured, every request must send `Authorization: Bearer <token>`.

**Machine-readable description:** all endpoints are also published — with descriptions and schemas — in the OpenAPI 3.1 document served at `GET /api/openapi.json`. When a token is configured, the document lists these (protected) endpoints only for requests carrying the token.

**Scope:** sessions currently *restored* (in memory) in a connected frontend are reported with their full state. Persisted sessions that have not been restored are reported with their persisted metadata and `"restored": false`; they can be restored on demand. With no frontend connected, the list is empty. Sessions known to multiple frontends are deduplicated (preferring restored, then in-progress, then more recent reports).

## `GET /api/ai/sessions`

Lists all sessions, sorted by `lastInteraction`, most recent first.

```json
{
  "sessions": [
    {
      "id": "d3f1a2b4-…",
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

Session summary fields:

| Field | Type | Values / meaning |
|---|---|---|
| `id` | string | Unique session id (UUID). |
| `title` | string, optional | Session title, if set by the user or generated. Absent otherwise. |
| `status` | string | Aggregated status derived from the session's last request. One of: `idle` (no request in progress; last one succeeded or was canceled), `running` (request in progress), `awaitingApproval` (a tool call needs user confirmation), `awaitingToolCall` (an approved/confirmation-free tool call is executing), `awaitingInput` (agent waits for user input, e.g. an answer to a question), `failed` (last request ended in an error). `awaitingApproval` and `awaitingInput` mean the session is blocked on the user. Sessions that are not restored report `failed` if their last request ended in an error, `idle` otherwise. |
| `lastInteraction` | number, optional | Timestamp of the last user interaction, milliseconds since epoch. For sessions that are not restored, the time the session was last saved. |
| `workspace` | string, optional | URI of the workspace the session belongs to (workspace folder or `.theia-workspace` file of the session's frontend), e.g. `file:///home/user/project`. Absent when that frontend has no open workspace. |
| `preview` | string, optional | The last few lines of the conversation as plain text (currently up to 5 non-empty lines, newline-separated, lines longer than 200 characters truncated with `…`). Absent for an empty conversation and for sessions that are not restored. |
| `agentId` | string, optional | ID of the agent driving the session. Absent when no agent is pinned to the session. |
| `agentName` | string, optional | Human-readable name of the agent driving the session. Absent when no agent is pinned or the agent is not registered. |
| `restored` | boolean | Whether the session is restored (live) in a connected frontend. Not-restored sessions report persisted metadata only. |

## `POST /api/ai/sessions`

Creates a new chat session in a connected frontend and optionally sends an initial prompt. The created session becomes the active session of its frontend (an externally created session is expected to be the one the user wants to work on); `focus: true` additionally raises the chat view.

Request body:

| Field | Type | Meaning |
|---|---|---|
| `workspace` | string, optional | The session is created in a frontend with this workspace open. May be omitted when all connected frontends share one workspace; ambiguous otherwise. Trailing slashes are ignored when matching. |
| `agentId` | string, optional | Agent to pin to the session. Without it, prompts are handled by the default agent. |
| `prompt` | string, optional | Initial prompt to send right after creation (may contain `@agent` mentions and variable references). |
| `focus` | boolean, optional | Raise the chat view in the IDE. |

Returns `201 Created`:

```json
{
  "session": { "id": "d3f1a2b4-…", "title": "Fix the failing tests", "status": "running", "restored": true, "agentId": "Coder", "…": "…" },
  "requestId": "a81c…"
}
```

`session` is a session summary (see the list endpoint); `requestId` identifies the request created for the initial prompt and is absent without one. Failures: `400 { "error": "unknown agent" }`, `400 { "error": "invalid request" }`, `404 { "error": "workspace not found" }` (no connected frontend matches), `409 { "error": "ambiguous workspace" }` (no workspace given, several different workspaces connected), `409 { "error": "no agent available" }` (the initial prompt could not be handled because no agent — mentioned, pinned, or default — was available; the session is not kept in that case).

## `POST /api/ai/sessions/:id/prompt`

Sends a prompt to the session, restoring it first if necessary. The prompt is processed like one typed in the chat view: `@agent` mentions select (and re-pin) the agent, tool calls run under the configured confirmation settings.

Request body:

| Field | Type | Meaning |
|---|---|---|
| `text` | string | The prompt text. Must be non-empty. |
| `interrupt` | boolean, optional | Cancel an in-progress request (including pending tool calls) before sending. Without it, prompting a busy session is rejected. |

Returns `202 Accepted` — the request has been submitted, not completed; follow the progress via the event stream or the read endpoints:

```json
{ "sessionId": "d3f1a2b4-…", "requestId": "a81c…" }
```

Failures: `400 { "error": "invalid request" }`, `404 { "error": "not found" }` (session unknown to all connected frontends), `409 { "error": "busy" }` (a request is in progress — status `running`, `awaitingApproval`, `awaitingToolCall`, or `awaitingInput` — and `interrupt` was not set), `409 { "error": "no agent available" }`.

## `GET /api/ai/sessions/events`

Streams the session list as [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). On connect, the stream immediately delivers the current list; afterwards, an updated list is pushed whenever sessions change (created, deleted, renamed, or status changed). Bursts of changes are coalesced (currently within ~100 ms on the backend plus ~200 ms per frontend), and comment lines (`: keep-alive`) are sent every 30 seconds to keep the connection alive.

```text
event: sessions
data: {"sessions":[…]}
```

Each `sessions` event carries the full, current session list in the same format as `GET /api/ai/sessions` — consume it as a replacement, not a delta.

When the external API configuration changes (delivery, port, or token), open streams are closed by the server; reconnect against the new configuration. Note that the browser `EventSource` API cannot send an `Authorization` header; when a token is configured, use `fetch` with a streaming body or an SSE client library.

## `GET /api/ai/sessions/:id`

Returns one session: all summary fields above plus `messages`, the session's conversation reduced to plain text. For persisted sessions that are not restored, only the summary fields are returned (no `messages`) — restore the session to read its conversation.

```json
{
  "id": "d3f1a2b4-…",
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

`messages` fields (one entry per conversation turn, oldest first):

| Field | Type | Values / meaning |
|---|---|---|
| `actor` | string | Who authored the entry: `user` or `ai`. |
| `text` | string | Plain-text rendering of the entry. User entries contain the text the user typed (including variable references like `#file`). AI entries contain the full response rendered as text: markdown/code as-is, tool calls as `Tool call: name(arguments)`, reasoning as `<Thinking>…</Thinking>`, errors as their message; parts are separated by blank lines. |

The conversation follows the currently active branch of the session (edited/regenerated alternatives are not included) — the same history Theia would send to the language model for the next request. An in-progress response is included with its content so far. Internal details (content ids, request branches, serialization metadata, token usage) are not exposed.

## `POST /api/ai/sessions/:id/open`

Shows the session in the chat view of a connected frontend, restoring it first if necessary. When several frontends know the session, the one with the restored (preferring in-progress) session is chosen. Returns `204 No Content` on success.

## `POST /api/ai/sessions/:id/restore`

Restores the session in a connected frontend without focusing it and returns the session detail (including `messages`). Restoring an already restored session is a no-op and returns its detail. After a restore, the session is reported with `"restored": true` and appears in the event stream.

## Errors

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ "error": "invalid request" }` | Malformed JSON or invalid/missing body fields. |
| 400 | `{ "error": "unknown agent" }` | The requested `agentId` is not registered. |
| 401 | `{ "error": "unauthorized" }` | Missing/invalid bearer token (when a token is configured). |
| 404 | `{ "error": "not found" }` | Session id unknown to all connected frontends. |
| 404 | `{ "error": "workspace not found" }` | No connected frontend matches the requested workspace. |
| 409 | `{ "error": "busy" }` | A request is in progress and `interrupt` was not set. |
| 409 | `{ "error": "ambiguous workspace" }` | No workspace given and several different workspaces are connected. |
| 409 | `{ "error": "no agent available" }` | No agent was found to handle the prompt. |
| 413 | `{ "error": "payload too large" }` | Request body exceeds the size limit (1 MB). |
| 500 | `{ "error": "internal error" }` | Failed to gather session data or perform the action. |

The `error` codes are stable and machine-readable. Body validation failures additionally carry the validation messages in a human-readable `details` array (e.g. `{ "error": "invalid request", "details": ["should have required property 'text'"] }`), which makes no stability promise.
