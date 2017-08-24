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
        expect(Globalize("en").formatMessage("workspace/browser/Open")).equal("Open...");
    });

    it('Test Internationalize string in Spanish', () => {

        // Test if the converted string is matching with the proper language
        expect(Globalize("es").formatMessage("workspace/browser/Open")).equal("Abierto...");
    });

    it('Test Internationalize string in French', () => {

        // Test if the converted string is matching with the proper language
        expect(Globalize("fr").formatMessage("workspace/browser/Open")).equal("Ouvrir...");
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
