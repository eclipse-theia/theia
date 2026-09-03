<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - GITHUB COPILOT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-copilot` extension integrates GitHub Copilot language models with Theia AI.
This allows users to authenticate with their GitHub Copilot subscription and use Copilot models (e.g., GPT-5, Claude Sonnet) through Theia's AI features.

> **Experimental:** This integration is under development and may be unstable. Its preferences are marked as experimental
> and are subject to change or removal.

Requests are served by the official GitHub Copilot CLI via [`@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk).
The CLI is launched as a background process on the machine hosting the Theia backend and is spoken to over JSON-RPC.

> **Note:** This extension requires an active GitHub Copilot subscription and the GitHub Copilot CLI.

### Installing the Copilot CLI

The CLI is not shipped with the application and has to be available on the machine hosting the backend:

```sh
npm install -g @github/copilot
```

It is looked up in the installation of the application, on the `PATH` of the backend process and in the global `npm` directory.
When it is installed somewhere else, point at its executable with the `ai-features.copilot.executablePath` preference:

```json
{
    "ai-features.copilot.executablePath": "/opt/copilot/copilot"
}
```

The `COPILOT_CLI_PATH` environment variable of the backend process does the same, for a deployment that configures this
centrally rather than per user.

The CLI is not bundled because it is a large platform-specific binary under a proprietary license, and because a packaged
application cannot execute a binary from inside its own archive. An application that wants to ship it has to install it
next to itself and make sure it stays extracted.

Only the CLI has to be installed. It ships the Copilot SDK next to its executable, and that is the copy this integration
loads, so `@github/copilot-sdk` does not have to be installed separately. Should a CLI distribution ever ship without that
copy, an installed `@github/copilot-sdk` is used as a fallback:

```sh
npm install -g @github/copilot-sdk
```

### Why the Copilot CLI

Access to the Copilot models is granted per OAuth application, not per user or per subscription.
An application that GitHub has not entitled only sees a small legacy subset of the models, regardless of the subscription or of the request headers it sends.
The Copilot CLI is an entitled first-party application, so routing through it makes the current model lineup available without Theia having to obtain an entitlement of its own.

### Authentication

The sign-in is a device code flow performed by the Copilot CLI, driven from within the application:

1. Click the "Copilot" status bar item or run the **Copilot: Sign In** command
2. A dialog appears with a device code, click the link to open GitHub's device authorization page
3. Enter the code and authorize
4. The dialog reports success and the status bar reflects the signed-in state

Once authenticated, Copilot models become available in the AI Configuration for use with any Theia AI agent.

The credentials are owned by the application, not by the CLI: the sign-in runs against a private, temporary Copilot home so that
the token is not written into the credential store of the machine, and it is then kept in the credential store of Theia.
The CLI is given that token for its requests and nothing else, so a token in the environment or an existing sign-in of the
GitHub CLI is never used, and **Copilot: Sign Out** removes the credentials of this application without touching either.

### Configuration

Available models can be configured via the `ai-features.copilot.modelOverrides` preference.
When it is empty, the models are discovered from your Copilot subscription:

```json
{
    "ai-features.copilot.modelOverrides": [
        "gpt-5.5",
        "claude-sonnet-5"
    ]
}
```

### Copilot Business and Enterprise

Copilot Business and Enterprise seats are served by their own API host, but nothing has to be configured for them:
the endpoint belonging to the subscription is resolved from the credentials of the sign-in.

Should that resolution ever fail for a deployment, the host can be forced with the `COPILOT_API_URL` environment variable
of the process running the backend, for example `https://api.business.githubcopilot.com`. This is a last resort rather than
part of the normal setup: a value that does not match the subscription makes every request fail, and GitHub reports that
the same way as a missing entitlement, which is hard to tell apart.

For GitHub Enterprise deployments, configure the domain via the `ai-features.copilot.enterpriseUrl` preference.
It is used for the sign-in, and remembered with the credentials so that requests go to the same deployment:

```json
{
    "ai-features.copilot.enterpriseUrl": "github.mycompany.com"
}
```

### Commands

- **Copilot: Sign In** - Signs in via the device code flow
- **Copilot: Sign Out** - Removes the stored credentials

### Known limitations

- The Copilot CLI has to be installed on the machine hosting the backend, see above.
- The Copilot CLI runs as a process on the machine hosting the backend, one per frontend connection.
  This is not suitable for multi-user backend deployments, where every connected frontend would share a single identity.
- Structured output is not available on this path.
- The request mapping is lossy, because the CLI is an agent that takes a single prompt per turn rather than a message history:
  - The conversation is flattened into one prompt. A single user turn is forwarded as it is, a longer history is rendered as a
    role-labelled transcript. The system prompt of the Theia agent is not part of that, it becomes the system message of the
    session and takes the place of the agent instructions the CLI would use.
  - Images in a request are dropped and only noted as omitted.
  - Tool calls and tool results of the history are rendered as text rather than as the structured entries they were.

## Additional Information

- [API documentation for `@theia/ai-copilot`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-copilot.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
