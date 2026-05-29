<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - ANTHROPIC EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/anthropic` extension integrates Anthropic's models with Theia AI.

The set of *official* Anthropic models is no longer configured via preferences. On startup, the extension fetches the available models from Anthropic's [`/v1/models`](https://docs.anthropic.com/en/api/models-list) endpoint, registers them with the Theia language model registry, and persists the response under the Theia configuration directory as `anthropic-models.json`. Subsequent startups read from the persisted snapshot to avoid hitting the network on every launch.

Use the `Anthropic: Refresh Available Models` command (command palette) to force a re-fetch, e.g. after Anthropic publishes a new model.

The Anthropic API key is configured via the `ai-features.anthropic.AnthropicApiKey` preference or, more securely, via the `ANTHROPIC_API_KEY` environment variable. Without a key (and without a previously persisted snapshot), no official models are registered until a key is provided.

Custom Anthropic-API-compatible endpoints are still configured via the `ai-features.anthropicCustom.customAnthropicModels` preference.

## Additional Information

- [API documentation for `@theia/ai-anthropic`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-anthropic.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
