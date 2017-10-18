# Theia - Localize Extension

Command to create a folder (i18n) for globalization and store a file to manipulate globalization in theia.

Go to the package you want to handle globalization
i.e. the editor package as an example
cd  package/editor
localize-theia editor

This previous command will create within the editor package a tree like this
.
├── i18n
│   └── en.json
└── src
    └── browser
        └── localize.ts

In the file you want to localize, add the following:
import { localize } from './localize';

And for the string you want to translate to different language:
The first argument: string to translate
The second argument: default string if the language package is not defined.
ex: localize("editor/browser/Code Editor", "Code Editor");
ex: localize("Cut", "Cut");

See [here](https://github.com/theia-ide/theia) for a detailed documentation.

## License
[Apache-2.0](https://github.com/theia-ide/theia/blob/master/LICENSE)