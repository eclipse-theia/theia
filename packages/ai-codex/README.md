<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - OPENAI CODEX INTEGRATION</h2>

<hr />

</div>

## Description

The `@theia/ai-codex` integrates OpenAI's Codex agent into the Theia platform, providing natural language coding assistance through the chat interface.

## Features

- Natural language coding assistance via OpenAI Codex SDK
- Thread-based conversation management
- Streaming responses with real-time updates
- Token usage tracking and cost monitoring
- Structured output support (JSON Schema, Zod)
- Integration with Theia's AI chat infrastructure

## Prerequisites

- Node.js 18 or higher
- OpenAI API key
- Install Codex SDK: `npm install -g @openai/codex-sdk`

## Configuration

### API Key

Codex requires an OpenAI API key. You can configure it in several ways (in order of priority):

1. **Codex-specific key** (highest priority):
   - Preference: `ai-features.codex.apiKey`
   - Use this if you want a separate API key for Codex

2. **Shared OpenAI key** (fallback):
   - Preference: `ai-features.openAiOfficial.openAiApiKey`
   - Shared with other OpenAI integrations in Theia

3. **Environment variable** (final fallback):

   ```bash
   export OPENAI_API_KEY=your-api-key-here
   ```

### Sandbox Mode

Codex operates in a sandbox mode that controls what file system operations are allowed. Configure this via the `ai-features.codex.sandboxMode` preference:

- **`read-only`**: Safest mode, only read operations allowed
- **`workspace-write`**: Recommended mode (default), allows writes within workspace
- **`danger-full-access`**: Unrestricted access (use with extreme caution)

For most use cases, the default `workspace-write` mode provides a good balance between safety and functionality.

### SDK Path

By default, Codex resolves the SDK from the global npm installation. You can override this:

- Preference: `ai-features.codex.sdkPath`
- Specify a custom path to the Codex SDK installation

### Example

If you already use OpenAI features in Theia, Codex will automatically use that API key. No additional configuration needed!

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)
- [OpenAI Codex SDK](https://github.com/openai/codex)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
