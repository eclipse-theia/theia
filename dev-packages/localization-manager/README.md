<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - LOCALIZATION-MANAGER</h2>

<hr />

</div>

## Description

The `@theia/localization-manager` package is used easily create localizations of Theia and Theia extensions for different languages. It has two main use cases.

First, it allows to extract localization keys and default values from `nls.localize` calls within the codebase using the `nls-extract` Theia-CLI command. Take this code for example:

```ts
const hi = nls.localize('greetings/hi', 'Hello');
const bye = nls.localize('greetings/bye', 'Bye');
```

It will be converted into this JSON file (`nls.json`):

```json
{
  "greetings": {
    "hi": "Hello",
    "bye": "Bye"
  }
}
```

Afterwards, any manual or automatic translation approach can be used to translate this file into other languages. These JSON files are supposed to be picked up by `LocalizationContribution`s.

Additionally, Theia provides a simple way to translate the generated JSON files out of the box using the [DeepL API](https://www.deepl.com/docs-api). For this, a [DeepL free or pro account](https://www.deepl.com/pro) is needed. Using the `nls-localize` command of the Theia-CLI, a target file can be translated into different languages. For example, when calling the command using the previous JSON file with the `fr` (french) language, the following `nls.fr.json` file will be created in the same directory as the translation source:

```json
{
  "greetings": {
    "hi": "Bonjour",
    "bye": "Au revoir"
  }
}
```


Only JSON entries without corresponding translations are translated using DeepL. This ensures that manual changes to the translated files aren't overwritten and only new translation entries are actually sent to DeepL.

Use `theia nls-localize --help` for more information on how to use the command and supply DeepL API keys.

For more information, see the [internationalization documentation](https://theia-ide.org/docs/i18n/).

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
