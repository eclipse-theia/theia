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
