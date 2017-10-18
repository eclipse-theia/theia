/*
 * Copyright (C) 2017 Ericson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import fs = require('fs');
import "mocha";
import * as chai from "chai";
import { MessageTranslation } from './message-translation';
const Globalize = require("globalize");
const expect = chai.expect;
import { localizeWithPrefix } from './localize';
const localize: Function = localizeWithPrefix("workspace-commands");


Globalize.load(
    // Core
    require("cldr-data/supplemental/likelySubtags"),
    require("cldr-data/supplemental/plurals")
);

describe('Some menu labels', () => {
    // Load the json file for each string in different languages
    loadMessagesfiles();

    it('Test Internationalize string in English', () => {
        MessageTranslation.setLocale("en");

        // Test if the converted string is matching with the proper language
        expect(localize("Open", "Error open")).equal("Open...");
        expect(localize("File", "Error File")).equal("File");
        expect(localize("New File", "Error New File")).equal("New File");
        expect(localize("New Folder", "Error New Folder")).equal("New Folder");
        expect(localize("Rename", "Error Rename")).equal("Rename");
        expect(localize("Delete", "Error Delete")).equal("Delete");
    });

    it('Test Internationalize string in Spanish', () => {
        MessageTranslation.setLocale("es");
        // Test if the converted string is matching with the proper language
        expect(localize("Open", "Error open")).equal("Abierto...");
        expect(localize("File", "Error File")).equal("Archivo");
        expect(localize("New File", "Error New File")).equal("Archivo Nuevo");
        expect(localize("New Folder", "Error New Folder")).equal("Nueva Carpeta");
        expect(localize("Rename", "Error Rename")).equal("Rebautizar");
        expect(localize("Delete", "Error Delete")).equal("Borrar");
    });

    it('Test Internationalize string in French', () => {
        MessageTranslation.setLocale("fr");
        // Test if the converted string is matching with the proper language
        expect(localize("Open", "Error open")).equal("Ouvrir...");
        expect(localize("File", "Error File")).equal("Fichier");
        expect(localize("New File", "Error New File")).equal("Nouveau Fichier");
        expect(localize("New Folder", "Error New Folder")).equal("Nouveau Dossier");
        expect(localize("Rename", "Error Rename")).equal("Renommer");
        expect(localize("Delete", "Error Delete")).equal("Effacer");
    });
});


// Load all Internationalization file (*.json)
function loadMessagesfiles() {
    const files = ["en.json", "es.json", "fr.json"];
    for (let i = 0; i < files.length; i++) {
        const filename = __dirname + "/../i18n/" + files[i];
        MessageTranslation.setLocaleData(JSON.parse(fs.readFileSync(filename, 'utf8')));
    }
}
