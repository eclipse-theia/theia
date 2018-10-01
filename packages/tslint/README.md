# Theia - TSLint Extension

See [here](https://www.theia-ide.org/doc/index.html) for a detailed documentation.

## Configuring the tslint-server-plugin

You can define settings for the `tslint-language-service` plugin in the `tsconfig.json` file.
The available settings are documented [here](https://github.com/angelozerr/tslint-language-service#configuration-options):
```json
{
    "compilerOptions": {
        "plugins": [
            {
                "name": "tslint-language-service",
                "alwaysShowRuleFailuresAsWarnings": false,
                "ignoreDefinitionFiles": true
                //"configFile": "../tslint.json",
                //"disableNoUnusedVariableRule": false
            }
        ],
    }
}
```

## Using a different version of tslint than the version that is bundled with the extension

The extension comes with a particular version of tslint.
If you want to use a different version then you have to install the `tslint-languageservice` package and `tslint` as a peer to the TypeScript version you want to use.
The modules folder should have the following layout:
- node_modules
  - typescript
  - tslint
  - tslint-language-service

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
