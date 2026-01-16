<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - GITHUB COPILOT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-copilot` extension integrates GitHub Copilot language models with Theia AI.
This allows users to authenticate with their GitHub Copilot subscription and use Copilot models (e.g., GPT-4o, Claude Sonnet) through Theia's AI features.

### Authentication

The extension uses GitHub's OAuth Device Flow for authentication:

1. Click the "Copilot" status bar item or run the **Copilot: Sign In** command
2. A dialog appears with a device code - click the link to open GitHub's device authorization page
3. Enter the code and authorize the application
4. The dialog updates to show "Authenticated" and the status bar reflects the signed-in state

Once authenticated, Copilot models become available in the AI Configuration for use with any Theia AI agent.

> **Note:** This extension requires an active GitHub Copilot subscription.

### Configuration

Available models can be configured via the `ai-features.copilot.models` preference:

```json
{
    "ai-features.copilot.models": [
        "gpt-4o",
        "claude-sonnet-4"
    ]
}
```

### GitHub Enterprise

For GitHub Enterprise users, configure the enterprise URL via the `ai-features.copilot.enterpriseUrl` preference:

```json
{
    "ai-features.copilot.enterpriseUrl": "github.mycompany.com"
}
```

### Commands

- **Copilot: Sign In** - Initiates the OAuth device flow authentication
- **Copilot: Sign Out** - Signs out and clears stored credentials

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
