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
    model: string
    url: string
    id?: string
    apiKey?: string | true
}
```

- `model` and `url` are mandatory attributes, indicating the end point and model to use
- `id` is an optional attribute which is used in the UI to refer to this configuration
- `apiKey` is either the key to access the API served at the given URL or `true` to use the global OpenAI API key. If not given 'no-key' will be used.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
