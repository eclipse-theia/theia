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
startup via `process.env.JIRA_TOKEN`. For enterprise vaults, register your
own resolver that matches `${vault:...}` at a higher priority.

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

### Client factory consumption

Phase B wires the `MCPClientFactory` contribution point, but `MCPServer`
doesn't yet delegate client construction to it. Plugins that want to wrap
the SDK client today must continue to replace `MCPServerManagerImpl`
until a follow-up widens `MCPClient`'s public surface. Track progress in
the RFC discussion on `eclipse-theia/theia`.

### `MCPClient` event surface (RFC Q3)

`MCPClient` exposes `onDidAddTools` and `onClose` events so reactive
status-bar / sidebar / telemetry consumers don't have to poll. The
default factory wires internal `__fireDidAddTools` / `__fireClose`
helpers that the in-tree `MCPServer` orchestration calls when tools
arrive or the transport closes. Plugin factories must wire their own
emitters — the contract is just the two `Event` getters on `MCPClient`.

This was promoted from a "later RFC" item to the public surface based on
downstream consumer demand: a reference implementation
([`Sutra IDE`](https://github.com/dwbimstr/theia-sutra-ide), commit
[`ff374f0`](https://github.com/dwbimstr/theia-sutra-ide/commit/ff374f0))
needed `onDidChange`-equivalent push semantics to drop status-bar
refresh latency from ~4s to ~50ms. Polling-only would force every
consumer to reinvent reactive state on top of a stale tick.

### Resolver ordering

Resolver chains run **priority-descending**. If your resolver returns
`undefined`, the registry consults the next lower-priority resolver. Use
this to compose resolvers — e.g. an OAuth resolver that only handles
`${oauth:...}` at priority 100, with `EnvCredentialResolver` (priority 50)
handling `${env:...}` and the preference fallback at priority 0.

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
