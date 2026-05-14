<!--
 Copyright (C) 2026 Satish Shivaji Rao.

 This program and the accompanying materials are made available under the
 terms of the Eclipse Public License v. 2.0 which is available at
 http://www.eclipse.org/legal/epl-2.0.

 SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
-->

# Migrating from a `@theia/ai-mcp` fork to the extension points

Before the four extension points landed, the common pattern for customising
Theia's MCP integration was to fork `@theia/ai-mcp`, patch `MCPServer.start()`
or `mcp-server-manager-impl.ts` in place, and ship the fork alongside the
rest of the application.

This doc walks through the mechanical swap from fork patches to upstream
extension-point contributions.

## Summary of the extension points

| Contribution point | Replaces fork patches in | Priority |
|---|---|---|
| `MCPTransportProvider` | Transport construction in `MCPServer.start()` | 0 (stdio + HTTP default); plugin providers typically >0 |
| `MCPCredentialResolver` | Inline `description.serverAuthToken` reads + header building | 0 (preference), 50 (env), plugin resolvers typically >50 |
| `MCPToolFilter` | Tool registration rewrite / suppression | 0 (passthrough); plugin filters >0 |
| `MCPClientFactory` | `new Client(...)` instantiation in `MCPServer.start()` | 0 (default SDK); plugin factories >0 |

## Step-by-step

### 1. Drop the fork's patched package

In your application's `package.json`, remove the resolution override that
pinned to the fork and reinstate the upstream version:

```diff
 "dependencies": {
-  "@theia/ai-mcp": "github:your-org/theia-ai-mcp-fork#ai-mcp-patches",
+  "@theia/ai-mcp": "^1.71.0",
 }
```

### 2. Identify what your fork changed

Run `git diff upstream/master HEAD -- packages/ai-mcp/` against your fork.
Typical categories:

- **Transport changes** — new `StdioClientTransport` variants, custom
  `StreamableHTTPClientTransport` wrappers, WebSocket transports.
  → Re-implement as an `MCPTransportProvider`.
- **Credential changes** — reading tokens from keychains, OAuth flows,
  vault lookups, env-var fallbacks.
  → Re-implement as an `MCPCredentialResolver`.
- **Tool registration changes** — hiding tools, renaming, adding
  descriptions.
  → Re-implement as an `MCPToolFilter`.
- **Client instrumentation changes** — logging wrappers, metrics,
  structured error handling.
  → Re-implement as an `MCPClientFactory`.

### 3. Rebuild each fork patch as a contribution

Each extension point has an interface + a DI symbol. Bind the
implementation in your plugin's `ContainerModule`:

```ts
import { ContainerModule } from '@theia/core/shared/inversify';
import { MCPCredentialResolver } from '@theia/ai-mcp';
import { VaultCredentialResolver } from './vault-credential-resolver';

export default new ContainerModule(bind => {
    bind(VaultCredentialResolver).toSelf().inSingletonScope();
    bind(MCPCredentialResolver).toService(VaultCredentialResolver);
});
```

The registry resolves contributions in descending-priority order. Use
`priority` to control where your implementation sits relative to the
defaults (which are at `priority: 0`).

### 4. Replace inline credential reads with sentinels

If your fork patched `MCPServer.start()` to read `description.serverAuthToken`
differently, you can now keep the upstream code path and express the
credential shape as a sentinel in the server description:

```jsonc
{
  "jira": {
    "serverUrl": "https://jira.example.com/mcp",
    "serverAuthToken": "${env:JIRA_TOKEN}"
  }
}
```

The built-in `EnvCredentialResolver` (priority 50) rewrites this at
startup via `process.env.JIRA_TOKEN`. POSIX-shell-style fallbacks are
also supported — `${env:JIRA_BASE_URL:-https://jira.example.com}` uses
the env var when set and non-empty, otherwise the literal default.
For enterprise vaults, register your own resolver that matches
`${vault:...}` at a higher priority.

For dynamic credentials (short-lived tokens, vault round-trips,
helper-script integrations), use the built-in
`HeadersHelperCredentialResolver` (priority 75) by configuring a shell
command on the server description:

```jsonc
{
  "internal-gateway": {
    "serverUrl": "https://gw.internal/mcp",
    "serverAuthToken": "${helper}",
    "headersHelper": "/usr/local/bin/get-mcp-token --server $MCP_SERVER_NAME"
  }
}
```

The helper is invoked with `MCP_SERVER_NAME` and `MCP_SERVER_URL` in
env, must write a JSON object to stdout, and must exit `0`. The
resolver looks up `request.field` (here `serverAuthToken`) as the
JSON key — override with `${helper:explicitKey}` if the JSON shape
differs. The helper is **only run when the workspace is trusted**
(see "Headers helper trust gating" below).

### 5. Delete the fork

Once every fork patch has been rebuilt as an extension-point contribution
and your application's tests pass against upstream `@theia/ai-mcp`, you can
archive or delete the fork.

## Common pitfalls

### Transport adapters

Third-party transport providers currently need to extend `SdkTransportAdapter`
so that `MCPServer` can unwrap the underlying SDK `Transport`. Widening
`MCPTransport` so fully-custom transports are first-class is tracked as a
follow-up.

### In-process MCP servers

For plugin-bundled MCP servers that live in the same Node.js process as
Theia's backend, prefer the `InProcessMCPServerDescription` variant
(`{ name, kind: 'in-process' }`) plus `createInProcessTransportPair`
over a subprocess + stdio. The helper returns two linked SDK transports;
wrap one in your plugin's own `MCPTransportProvider` (returning the
client side as the `MCPTransport`) and pass the other to
`@modelcontextprotocol/sdk/server`'s `Server.connect()`. See the README
section "In-process MCP servers" for a worked example.

If you register an `InProcessMCPServerDescription` but no
`MCPTransportProvider` matches, `MCPServer.start()` throws a
descriptive error rather than failing with `transport is undefined`
deeper in the SDK — the contribution wiring is a configuration error
and should surface immediately.

### Client factory consumption

Phase B wires the `MCPClientFactory` contribution point, but `MCPServer`
doesn't yet delegate client construction to it. Plugins that want to wrap
the SDK client today must continue to replace `MCPServerManagerImpl`
until a follow-up widens `MCPClient`'s public surface. Track progress in
the RFC discussion on `eclipse-theia/theia`.

### Tool filter context

`MCPToolFilter.filter` receives a single `MCPToolFilterContext` argument
rather than the earlier `(serverName, tool)` pair. Forks that patched
`MCPServer` with custom `(serverName, tool, ...extra)` signatures can
move the extra signals onto the context object as the contribution
point grows; the current shape is:

```ts
interface MCPToolFilterContext {
    readonly serverName: string;
    readonly serverDescription: MCPServerDescription;
    readonly tool: ToolInformation;
    readonly workspaceTrustLevel: 'trusted' | 'restricted' | 'unknown';
}
```

`workspaceTrustLevel` is sourced from Theia's `WorkspaceTrustService` (a
browser-only module) and pushed to the backend by the frontend
application contribution. Filters that key off it should treat
`'unknown'` as untrusted — that value appears when no frontend has
pushed a value yet (RPC consumers, headless deployments, race on
startup before trust resolves).

Filters that *rename* a tool should preserve the upstream name on
`ToolInformation.originalName` so downstream filters and any
introspection / consent UI built on top of the registry can attribute
the tool back to its source. The optional `provenance` field is the
sibling slot for federated topologies — set it to the upstream server
name (or `"<gateway>:<upstream>"`) when one Theia-side connection
fronts multiple physical MCP servers.

### `MCPClient` event surface

`MCPClient` exposes four events covering both **inventory** and
**invocation** semantics so reactive UI, telemetry, and policy
consumers don't have to poll or replace the entire client factory.

Inventory events (originally RFC Q3):

- `onDidAddTools`: fires when the connected MCP server advertises new
  tools after the initial handshake.
- `onClose`: fires once when the transport closes (graceful or with
  an error).

Invocation events (added in a follow-up commit):

- `onWillInvokeTool`: fires immediately before each tool invocation
  with `{ toolName, argsJSON }`. Right place to start an OpenTelemetry
  span, write a structured-log entry, run a runtime RBAC check.
- `onDidInvokeTool`: fires after each invocation with
  `{ toolName, durationMs, ok, error? }`. Right place to close the
  span and emit duration metrics. The `error` payload is shaped as
  `{ name, message }` rather than a thrown `Error` so it survives
  JSON-roundtripping for cross-process consumers (status bars in a
  separate worker, telemetry exporters in a sidecar, etc.).

The default factory wires internal `__fireDidAddTools` / `__fireClose`
/ `__fireWillInvokeTool` / `__fireDidInvokeTool` helpers that the
in-tree `MCPServer` orchestration calls. Plugin factories must wire
their own emitters — the contract is just the four `Event` getters on
`MCPClient`.

The inventory events were promoted from a "later RFC" item to the
public surface based on downstream consumer demand: a reference
implementation
([`Sutra IDE`](https://github.com/dwbimstr/theia-sutra-ide), commit
[`ff374f0`](https://github.com/dwbimstr/theia-sutra-ide/commit/ff374f0))
needed `onDidChange`-equivalent push semantics to drop status-bar
refresh latency from ~4s to ~50ms. Polling-only would force every
consumer to reinvent reactive state on top of a stale tick. The
invocation events are the call-site equivalent: production deployments
that front MCP through a proxy
([agentgateway](https://github.com/agentgateway/agentgateway) is the
canonical example) instrument every tool call for OpenTelemetry; the
existing `MCPClientFactory` lets plugins do this by wrapping the whole
client, but invocation events let consumers attach observability
without taking on the full client-replacement burden.

### Resolver ordering

Resolver chains run **priority-descending**. If your resolver returns
`undefined`, the registry consults the next lower-priority resolver. Use
this to compose resolvers — e.g. an OAuth resolver that only handles
`${oauth:...}` at priority 100, with `EnvCredentialResolver` (priority 50)
handling `${env:...}` and the preference fallback at priority 0.

### Headers helper trust gating

`HeadersHelperCredentialResolver` runs an arbitrary shell command from
the server description. Because that description can come from
project-scoped settings (workspace `.theia/settings.json`, multi-root
workspace files), an attacker-supplied project could otherwise execute
arbitrary code by configuring a malicious `headersHelper`.

The resolver hard-refuses unless `request.workspaceTrustLevel ===
'trusted'`. Trust state is sourced from
`@theia/workspace`'s frontend-only `WorkspaceTrustService` and pushed
to the backend via `MCPServerManager.setWorkspaceTrustLevel`. When no
frontend has pushed a value (RPC-only consumers, headless deployments,
race on startup before trust resolves) the level is `'unknown'` and
the resolver behaves as if `'restricted'` — fail closed.

Plugin-supplied resolvers that execute external commands or hit
external services with credentials sourced from project-scoped config
should mirror this guard. The `workspaceTrustLevel` field is part of
`MCPCredentialRequest` for exactly this reason.

Plugin-supplied resolvers that read from operator-scoped sources
(env vars, OS keychain, vault tokens injected by the operator's
sidecar) generally do **not** need the gate, because the credential
material is already operator-owned rather than workspace-supplied —
the threat model is different.

### Connection-scoped container

`@theia/ai-mcp` uses a `ConnectionContainerModule`, so contributions live
in the per-frontend-connection container. `bindContributionProvider`
(rather than `bindRootContributionProvider`) is the correct call; see
[`CLAUDE.md`](../../../CLAUDE.md) and
[`eclipse-theia/theia#10877`](https://github.com/eclipse-theia/theia/issues/10877#issuecomment-1107000223)
for the rationale.

## Questions / feedback

The RFC discussion is at [#17375](https://github.com/eclipse-theia/theia/discussions/17375).
Please leave a comment if you hit a case the extension points don't cover,
or if you have a fork pattern we should consider adding a fifth
extension point for.
