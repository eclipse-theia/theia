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
- OpenAI API key (configured via Theia preferences)

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
