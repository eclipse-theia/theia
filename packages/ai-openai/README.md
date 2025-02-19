<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - Open AI EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-openai` integrates OpenAI's models with Theia AI.
The OpenAI API key and the models to use can be configured via preferences.
Alternatively the OpenAI API key can also be handed in via the `OPENAI_API_KEY` variable.

### Custom models

The extension also supports OpenAI compatible models hosted on different end points.
You can configure the end points via the `ai-features.openAiCustom.customOpenAiModels` preference:

```ts
{
    model: string,
    url: string,
    id?: string,
    apiKey?: string | true,
    apiVersion?: string | true,
    developerMessageSettings?: 'user' | 'system' | 'developer' | 'mergeWithFollowingUserMessage' | 'skip',
    enableStreaming?: boolean
}
```

- `model` and `url` are mandatory attributes, indicating the end point and model to use
- `id` is an optional attribute which is used in the UI to refer to this configuration
- `apiKey` is either the key to access the API served at the given URL or `true` to use the global OpenAI API key. If not given 'no-key' will be used.
- `apiVersion` is either the api version to access the API served at the given URL in Azure or `true` to use the global OpenAI API version.
- `developerMessageSettings` Controls the handling of system messages: `user`, `system`, and `developer` will be used as a role, `mergeWithFollowingUserMessage` will prefix the
  following user message with the system message or convert the system message to user message if the next message is not a user message. `skip` will just remove the system message.
  Defaulting to `developer`.
- `enableStreaming` is a flag that indicates whether the streaming API shall be used or not. `true` by default.

### Azure OpenAI

To use a custom OpenAI model hosted on Azure, the `AzureOpenAI` class needs to be used, as described in the 
[openai-node docs](https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai).

Requests to an OpenAI model hosted on Azure need an `apiVersion`. To configure a custom OpenAI model in Theia you therefore need to configure the `apiVersion` with the end point.
Note that if you don't configure an `apiVersion`, the default `OpenAI` object is used for initialization and a connection to an Azure hosted OpenAI model will fail.

An OpenAI model version deployed on Azure might not support the `developer` role. In that case it is possible to configure whether the `developer` role is supported or not via the 
`developerMessageSettings` option, e.g. setting it to `system` or `user`.

The following snippet shows a possible configuration to access an OpenAI model hosted on Azure. The `AZURE_OPENAI_API_BASE_URL` needs to be given without the `/chat/completions` 
path and without the `api-version` parameter, e.g. _`https://<my_prefix>.openai.azure.com/openai/deployments/<my_deployment>`_

```json
{
  "ai-features.AiEnable.enableAI": true,
  "ai-features.openAiCustom.customOpenAiModels": [
    {
      "model": "gpt4o",
      "url": "<AZURE_OPENAI_API_BASE_URL>",
      "id": "azure-deployment",
      "apiKey": "<AZURE_OPENAI_API_KEY>",
      "apiVersion": "<AZURE_OPENAI_API_VERSION>",
      "developerMessageSettings": "system"
    }
  ],
  "ai-features.agentSettings": {
    "Universal": {
      "languageModelRequirements": [
        {
          "purpose": "chat",
          "identifier": "azure-deployment"
        }
      ]
    },
    "Orchestrator": {
      "languageModelRequirements": [
        {
          "purpose": "agent-selection",
          "identifier": "azure-deployment"
        }
      ]
    }
  }
}
```

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
