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

- Include `@theia/ai-mcp-ui` to gain access to the MCP server commands: start, stop, sign in to and sign out from OAuth-enabled servers, and `"MCP: Get MCP OAuth Redirect URL"`.

### Configuration

To configure MCP servers, include `@theia/mcp-ui` or `bind` the included `mcp-preferences`.

Afterwards, open the preferences and add entries to the `MCP Servers Configuration` section. Each server requires a unique identifier (e.g., `"brave-search"` or `"filesystem"`) and configuration details such as the command, arguments, optional environment variables, and autostart (true by default).

`"autostart"` (true by default) will automatically start the respective MCP server whenever you restart your Theia application. In your current session, however, you'll still need to **manually start it** using the `"MCP: Start MCP Server"` command.

MCP servers managed by a frontend connection are stopped when that connection disconnects, including local stdio child processes. In browser deployments, refreshing or closing the browser tab therefore terminates the running servers; autostart-tagged servers will start again on reconnect, but manually-started servers will need to be restarted via the `"MCP: Start MCP Server"` command.

Remote MCP servers that require OAuth 2.1 authorization can be configured with an `oauth` object. The presence of the `oauth` object enables OAuth for the server (remove it to disable OAuth) and lets Theia open the authorization page in the user's browser, receive the redirect on `<theia-origin>/mcp/oauth/callback`, store OAuth tokens, dynamically registered client information, and discovery state in Theia's credential store, and refresh tokens through the MCP SDK. Theia uses public OAuth clients with PKCE; optional static `clientId` values are stored in preferences and can be used when an authorization server does not allow dynamic public-client registration.

Theia's credential store relies on the OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret/gnome-keyring on Linux). On Linux without libsecret available, the store silently falls back to an in-memory provider; OAuth tokens then do not survive a backend restart and autostart of OAuth-enabled servers is skipped after a restart. Install `libsecret`/`gnome-keyring` to make OAuth credentials persistent on Linux.

The configured `resource` is interpreted as an RFC 8707 resource indicator and checked against the MCP server URL with the SDK's `checkResourceAllowed` helper. The matcher is origin-based, so a configured `resource` of `https://mcp.example.com` is considered to cover requests for `https://mcp.example.com/mcp`. When `resource` is configured without a path, the returned resource URL is the configured value with no path; when `resource` is not configured at all, the returned resource URL is the MCP server URL with its fragment stripped (the path is preserved). MCP OAuth does not provide per-path resource scoping.

OAuth credentials are keyed by MCP server name and server URL/resource in the system credential store. Workspaces using the same server name and URL/resource share the stored session, and renaming a server requires signing in again on the new name. Deleting the old server entry (or renaming it via preference edit, which Theia treats as a delete-and-re-add) wipes the previous credentials automatically; no manual sign-out step is required. In hosted deployments where multiple human users share one backend and one OS credential store, configure separate server names/resources per user or provide an isolated credential store to avoid sharing OAuth sessions between users. The OAuth callback service that routes redirects to in-flight authorizations is also process-global; its active/rejected callback caps are shared across frontends on the same backend, so deploy one backend per user when multi-user isolation is required. Use `"MCP: Sign Out from MCP Server"` to clear stored OAuth credentials. Browser popup blockers can prevent OAuth sign-in; allow popups for the Theia origin if the authorization page does not open. In Electron deployments, sign-in launches in the user's system default browser instead of an in-app popup; the OAuth callback is delivered to a dedicated loopback HTTP server bound to `http://127.0.0.1:28932/mcp/oauth/callback` (the RFC 8252 native-app loopback redirect), separate from the cookie-protected backend server. The port defaults to `28932` and can be overridden by setting the `THEIA_MCP_OAUTH_CALLBACK_PORT` environment variable on the backend process if it conflicts with another service on the host.

In browser/hosted deployments, the callback URL is computed as `<theia-origin>/mcp/oauth/callback` at runtime; in Electron it is the fixed loopback URL `http://127.0.0.1:<port>/mcp/oauth/callback` described above. The two authorization-server paths handle it differently. With **dynamic client registration** (the default, when `oauth.clientId` is not set), Theia advertises the callback URL to the authorization server in `redirect_uris` during the registration request; no separate console step is required. With a **static `oauth.clientId`** (the registration-skipped path), the redirect URI registered with the OAuth provider's developer console must exactly match the callback URL (`<theia-origin>/mcp/oauth/callback` in browser/hosted, or `http://127.0.0.1:<port>/mcp/oauth/callback` with the configured port in Electron), otherwise the authorization server will reject the callback with `redirect_uri_mismatch`. The Add/Edit MCP Server dialog displays the effective redirect URL of the running deployment when the `Remote (OAuth)` server type is selected, so it can be copied directly when registering a static client; the `"MCP: Get MCP OAuth Redirect URL"` command shows the same URL with a copy action without opening the dialog. If Theia is served behind a reverse proxy, make sure the proxy forwards this callback path to the Theia backend, including deployments served below a base path such as `/theia/`; if the frontend is exposed under a base path, the proxy must strip that prefix or otherwise route the generated callback URL to the backend route. The current callback URL is computed from the frontend URL; browser deployments should therefore expose the frontend and backend on the same public origin and route prefix. Callback page strings are rendered by the backend and use the backend locale. Authorization `code` and `state` values appear in callback query strings and may be captured by browser history or access logs; avoid sharing those logs while callbacks are still valid. OAuth state validation with a random UUID prevents callback poisoning.

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
          },
          "remote-oauth": {
            "serverUrl": "https://mcp.example.com/mcp",
            "oauth": {
              "clientId": "OPTIONAL_STATIC_CLIENT_ID",
              "scopes": ["mcp.read", "mcp.write"],
              "authorizationServer": "https://auth.example.com",
              "resource": "https://mcp.example.com"
            }
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
