/*
 * Copyright (C) 2017 Ericson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
const fs = require('fs-extra');

/*
* Command to create the i18n folder for globalization and the localise file to use in theia.
* i.e.:  localize-theia.ts <package>
  ex:  localize-theia.ts core
*/
function createThis() {
    if (process.argv.length > 2) {
        // Read the first additional argument passed to the program
        const myPackage = process.argv[2];
        const localizeFile = "localize.ts";
        const browserPath = "./src/browser/";
        const localizePath = "./src/";
        const i18nPath = "./i18n";

        let packagePath = "";

        let content = copyRight(); // insert the file copyright to start

        // Set the content of the file
        if (myPackage === "localize") {
            packagePath = localizePath;
            content = content + "\n" + importLocalize() + "\n" + fileContent() + localizeTryContent();
        } else {
            // any package other than "localize"
            packagePath = browserPath;
            content = content + "\n" + importBrowser() + "\n" + fileContent() + generalTryContent();
        }



        // Create the file to maintain the globalize message
        const globalizeFile = packagePath + localizeFile;

        // Create the folder to put the localize file
        fs.ensureDirSync(packagePath);
        fs.writeFileSync(globalizeFile, content);

        // Command to create the i18n folder.
        fs.ensureDirSync(i18nPath);
        console.log("Localize for ( " + myPackage + " ) created.");
    } else {
        console.log("ERROR: Please pass on a package");
    }
}

// Have the main content of the file
function fileContent() {
    return `
function localize(prefix: string, selection: string, defaultSelection: string): string {
    return MessageTranslation.localize(prefix + "/" + selection, defaultSelection);
}

export function localizeWithPrefix(prefix: string) {
    return localize.bind(undefined, prefix);
}`;
}

// Have the general try content of the file
function generalTryContent() {
    return `
try {
    const data = require('../../i18n/' + MessageTranslation.getLocale() + '.json');
    MessageTranslation.setLocaleData(data);
    MessageTranslation.setLocale(MessageTranslation.getLocale());
} catch (Error) {
    console.log(Error);
}`;
}

// Have the localize try content of the file
function localizeTryContent() {
    return `
try {
    const data = require('../i18n/' + MessageTranslation.getLocale() + '.json');
    MessageTranslation.setLocaleData(data);
    MessageTranslation.setLocale(MessageTranslation.getLocale());
} catch (Error) {
    console.log(Error);
}`;
}

// Have the copyright on top of the file
function copyRight() {
    return `/*
 * Copyright (C) 2017 Ericson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * @generated_code
 */`;
}

// Let put the import used in the browser section.
function importBrowser() {
    return `
import { MessageTranslation } from '@theia/localize/lib/message-translation';
// @ts-check`;
}

// Let put the import used in the localize section.
function importLocalize() {
    return `
import { MessageTranslation } from './message-translation';
// @ts-check`;
}

exports.create = createThis;
