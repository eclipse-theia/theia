/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import fs = require('fs');
import "mocha";
import * as chai from "chai";
const Globalize = require("globalize");

const expect = chai.expect;

beforeEach(() => {
});

// describe('internationalization', () => {

describe('01 Some menu labels', () => {
    // Load the json file for each string in different languages
    loadMessagesfiles();
    Globalize.load(
        // Core
        require("cldr-data/supplemental/likelySubtags"),
        require("cldr-data/supplemental/plurals")
    );

    it('Test Internationalize string in English', () => {

        // Test if the converted string is matching with the proper language
        expect(Globalize("en").formatMessage("filesystem/browser/File")).equal("File");
        expect(Globalize("en").formatMessage("filesystem/browser/New File")).equal("New File");
        expect(Globalize("en").formatMessage("filesystem/browser/New Folder")).equal("New Folder");
        expect(Globalize("en").formatMessage("filesystem/browser/Open")).equal("Open...");
        expect(Globalize("en").formatMessage("filesystem/browser/Rename")).equal("Rename");
        expect(Globalize("en").formatMessage("filesystem/browser/Delete")).equal("Delete");
    });

    it('Test Internationalize string in Spanish', () => {

        // Test if the converted string is matching with the proper language
        expect(Globalize("es").formatMessage("filesystem/browser/File")).equal("Archivo");
        expect(Globalize("es").formatMessage("filesystem/browser/New File")).equal("Archivo Nuevo");
        expect(Globalize("es").formatMessage("filesystem/browser/New Folder")).equal("Nueva Carpeta");
        expect(Globalize("es").formatMessage("filesystem/browser/Open")).equal("Abierto...");
        expect(Globalize("es").formatMessage("filesystem/browser/Rename")).equal("Rebautizar");
        expect(Globalize("es").formatMessage("filesystem/browser/Delete")).equal("Borrar");
    });

    it('Test Internationalize string in French', () => {

        // Test if the converted string is matching with the proper language
        expect(Globalize("fr").formatMessage("filesystem/browser/File")).equal("Fichier");
        expect(Globalize("fr").formatMessage("filesystem/browser/New File")).equal("Nouveau Fichier");
        expect(Globalize("fr").formatMessage("filesystem/browser/New Folder")).equal("Nouveau Dossier");
        expect(Globalize("fr").formatMessage("filesystem/browser/Open")).equal("Ouvrir...");
        expect(Globalize("fr").formatMessage("filesystem/browser/Rename")).equal("Renommer");
        expect(Globalize("fr").formatMessage("filesystem/browser/Delete")).equal("Effacer");
    });
});


// Load all Internationalization file (*.json)
function loadMessagesfiles() {
    const files = ["en.json", "es.json", "fr.json"];
    for (let i = 0; i < files.length; i++) {
        const filename = __dirname + "/" + files[i];
        Globalize.loadMessages(JSON.parse(fs.readFileSync(filename, 'utf8')));
    }
}
