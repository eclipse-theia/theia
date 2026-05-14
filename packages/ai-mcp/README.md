<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI MCP EXTENSION</h2>

<hr />

</div>

## Description

The AI MCP package provides an integration that allows users to start and use MCP servers to provide additional tool functions to LLMs, e.g. search or file access (outside of the workspace).

### Features

- Offers the framework to add/remove and start/stop MCP servers
- Use tool functions provided by MCP servers in prompt templates

### Commands

- Include `@theia/ai-mcp-ui` to gain access to the start and stop MCP sever commands.

### Configuration

To configure MCP servers, include `@theia/mcp-ui` or `bind` the included `mcp-preferences`.

Afterwards, open the preferences and add entries to the `MCP Servers Configuration` section. Each server requires a unique identifier (e.g., `"brave-search"` or `"filesystem"`) and configuration details such as the command, arguments, optional environment variables, and autostart (true by default).

`"autostart"` (true by default) will automatically start the respective MCP server whenever you restart your Theia application. In your current session, however, you'll still need to **manually start it** using the `"MCP: Start MCP Server"` command.

Example Configuration:

```json
{
    "ai-features.mcp.mcpServers": {
        "memory": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-memory"
            ],
            "autostart": false
          },
          "brave-search": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-brave-search"
            ],
            "env": {
              "BRAVE_API_KEY": "YOUR_API_KEY"
            }
          },
          "filesystem": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-filesystem",
              "ABSOLUTE_PATH_TO_ALLOWED_DIRECTORY",
            ]
          },
          "git": {
            "command": "uv",
            "args": [
              "--directory",
              "/path/to/repo",
              "run",
              "mcp-server-git"
            ]
          },
          "git2": {
            "command": "uvx",
            "args": [
              "mcp-server-git",
              "--repository",
              "/path/to/otherrepo"
            ]
          }
    }
}
```

Example prompt (for search)

```md
~{mcp_brave-search_brave_web_search}
```

Example User query

```md
Search the internet for XYZ
```

### More Information

[Theia AI MCP UI README](https://github.com/eclipse-theia/theia/tree/master/packages/ai-mcp-ui)
[User documentation on MCP in the Theia IDE](https://theia-ide.org/docs/user_ai/#mcp-integration)
[List of available MCP servers](https://github.com/modelcontextprotocol/servers)

## Extension Points

Four contribution points let plugins customise MCP transport, credentials, tool registration, and client instantiation without forking this package. The contribution shape mirrors Theia's standard `ContributionProvider<T>` pattern. Default implementations ship with `priority: 0` and reproduce today's behaviour bit-for-bit, so deployments without any plugin bindings see zero change.

### Responsibility flow

The four extension points compose into a one-direction pipeline. Reading them in order makes it easier to reason about what each plugin is allowed to see and decide:

1. **Transport** — `MCPTransportProvider` opens the connection boundary to the MCP server (stdio, Streamable HTTP, in-process, plugin-defined WebSocket / gRPC, etc.). Operates on raw bytes and the `MCPServerDescription`.
2. **Credentials** — `MCPCredentialResolver` supplies identity (token, OAuth bearer, signed header) **at the transport layer**. The chain returns a string that the transport injects into outbound headers. Resolved credentials never enter the LLM prompt context — they exist only as transport headers, by construction.
3. **Tool filter** — `MCPToolFilter` decides which tools advertised by the now-connected server are registered into Theia's `ToolInvocationRegistry`. Suppress, rename, rewrite description, or stamp provenance — but the tool's input schema and runtime behaviour are not the filter's concern.
4. **Runtime hooks** — `MCPClient`'s event surface (`onDidAddTools`, `onClose`, …) lets consumers observe inventory + connection state. Plugin-supplied `MCPClientFactory` implementations can wrap the SDK client to add cross-cutting concerns (metrics, distributed tracing, structured logging) without re-implementing transport / credentials / filtering.

The strict left-to-right separation matters for the security story: a plugin that wants to gate "which tools may run when workspace trust is restricted" goes through the **filter** layer, not by intercepting credentials or rewriting messages on the transport. A plugin that wants to inject a per-tenant header goes through the **credential** layer, not by rewriting the description.

### Gateway-aware deployments

In production deployments where Theia talks to an MCP gateway (e.g. [agentgateway](https://github.com/agentgateway/agentgateway) — a Linux Foundation proxy that fronts MCP, A2A, and LLM providers), the gateway typically:

- Federates many upstream MCP servers into a single Theia-visible endpoint.
- Resolves per-tenant credentials internally (the credential the Theia-side resolver returns is "talk to the gateway", not per-server).
- Applies its own server-side tool filtering / RBAC policies.

The four contribution points still apply, but their responsibilities shift. Theia's `MCPCredentialResolver` returns the gateway credential; the gateway resolves the actual upstream creds. Theia's `MCPToolFilter` becomes a **defense-in-depth fallback** — it sees the federated tool inventory the gateway exposes and can suppress / rename / annotate further. The takeaway: the four-layer model holds for both direct-to-server and gateway-fronted topologies, with the same plugin contracts.

### `MCPTransportProvider`

Plug in a transport implementation keyed on `MCPServerDescription`. Built-in providers handle stdio and Streamable HTTP; plugins can register WebSocket, in-process, gRPC, or daemon-proxied transports at a higher priority.

```ts
@injectable()
export class WebSocketTransportProvider implements MCPTransportProvider {
    readonly id = 'websocket';
    readonly priority = 100;

    matches(description: MCPServerDescription): boolean {
        return isRemoteMCPServerDescription(description)
            && description.serverUrl.startsWith('ws');
    }

    async create(description: MCPServerDescription, signal: AbortSignal): Promise<MCPTransport> {
        // ...
    }
}
```

Bind as a service: `bind(MCPTransportProvider).toService(WebSocketTransportProvider);`

### `MCPCredentialResolver`

Resolve credential-shaped values (`${env:NAME}`, `${mcp:credential}`, or any custom sentinel) by returning the real value or `undefined` to defer to the next resolver in priority order. Typical contributions:

- OAuth flow launching a browser and persisting tokens in the OS keychain.
- Reading from HashiCorp Vault, 1Password CLI, AWS Secrets Manager.
- Environment variable interpolation (shipped as `EnvCredentialResolver`, priority 50).

```ts
@injectable()
export class VaultCredentialResolver implements MCPCredentialResolver {
    readonly id = 'vault';
    readonly priority = 100;

    async resolve(request: MCPCredentialRequest): Promise<string | undefined> {
        if (!request.literal?.startsWith('${vault:')) {
            return undefined;
        }
        const key = request.literal.slice(8, -1);
        return await fetchFromVault(key);
    }
}
```

### `MCPToolFilter`

Rewrite, suppress, or stamp tools advertised by MCP servers before they are registered into Theia's `ToolInvocationRegistry`. Return a replacement `ToolInformation`, `undefined` to suppress, or `'passthrough'` to defer to the next filter.

```ts
@injectable()
export class HideDangerousToolsFilter implements MCPToolFilter {
    readonly id = 'hide-dangerous';
    readonly priority = 100;

    filter(serverName: string, tool: ToolInformation): MCPToolFilterOutcome {
        if (tool.name === 'execute_shell' && serverName === 'untrusted-server') {
            return undefined;
        }
        return 'passthrough';
    }
}
```

### `MCPClientFactory`

Swap the SDK `Client` wrapper for instrumented / patched variants. The default factory wraps `@modelcontextprotocol/sdk`'s `Client` unchanged; plugins can add metrics, distributed tracing, or replace the underlying SDK.

```ts
@injectable()
export class InstrumentedMCPClientFactory implements MCPClientFactory {
    readonly id = 'instrumented';
    readonly priority = 100;

    async create(description, transport, context) {
        const tracer = opentelemetry.trace.getTracer('theia-mcp');
        // ... return an MCPClient that records spans around every tool call
    }
}
```

#### `MCPClient` event surface

`MCPClient` exposes two events for push-based reactive UI — needed by status-bar indicators, sidebar lists, and telemetry pills that would otherwise be forced to poll on a multi-second tick.

```ts
export interface MCPClient {
    readonly name: string;
    readonly tools: ToolInformation[];
    readonly onDidAddTools: Event<ToolInformation[]>;
    readonly onClose: Event<Error | undefined>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
```

- `onDidAddTools` fires when the connected MCP server advertises new tools after the initial handshake (dynamic registration, plugin-loaded modules, server `tools/list_changed` notifications). Consumers re-read `client.tools` for the canonical list.
- `onClose` fires once when the underlying transport closes — gracefully (`stop()` was called) or with an error (the argument).

Plugin factories must wire their own emitters; the default factory exposes internal `__fireDidAddTools` / `__fireClose` hooks so the in-tree `MCPServer` orchestration can drive them. See `default-mcp-client-factory.spec.ts` for the contract.

### Migration guide

If you currently ship a fork of `@theia/ai-mcp` to patch in custom transports, credential flows, or tool filtering, [doc/MIGRATION.md](./doc/MIGRATION.md) walks through the mechanical swap from fork patches to extension-point contributions.

### Cookbook: contributing a custom credential resolver

A complete, minimal plugin module that contributes a vault-backed credential resolver:

```ts
// my-vault-plugin/src/node/vault-credential-resolver.ts
import { injectable } from '@theia/core/shared/inversify';
import { MCPCredentialRequest, MCPCredentialResolver } from '@theia/ai-mcp';

@injectable()
export class VaultCredentialResolver implements MCPCredentialResolver {
    readonly id = 'vault';
    readonly priority = 100; // Higher than the default env (50) and preference (0) resolvers.

    async resolve(request: MCPCredentialRequest): Promise<string | undefined> {
        if (!request.literal?.startsWith('${vault:')) {
            return undefined;
        }
        const key = request.literal.slice('${vault:'.length, -1);
        // Fetch from your secret store; return undefined to defer if not found.
        return await fetchFromVault(request.serverName, key);
    }
}
```

```ts
// my-vault-plugin/src/node/my-vault-backend-module.ts
import { ContainerModule } from '@theia/core/shared/inversify';
import { MCPCredentialResolver } from '@theia/ai-mcp';
import { VaultCredentialResolver } from './vault-credential-resolver';

export default new ContainerModule(bind => {
    bind(VaultCredentialResolver).toSelf().inSingletonScope();
    bind(MCPCredentialResolver).toService(VaultCredentialResolver);
});
```

Operators then write `"serverAuthToken": "${vault:jira-pat}"` in their MCP preferences and the resolver materialises the real token at startup.

## Additional Information

- [API documentation for `@theia/mcp`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-mcp.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
