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
        expect(Globalize("en").formatMessage("core/common/Edit")).equal("Edit");
        expect(Globalize("en").formatMessage("core/common/Cut")).equal("Cut");
        expect(Globalize("en").formatMessage("core/common/Copy")).equal("Copy");
        expect(Globalize("en").formatMessage("core/common/Paste")).equal("Paste");
        expect(Globalize("en").formatMessage("core/common/Undo")).equal("Undo");
        expect(Globalize("en").formatMessage("core/common/Redo")).equal("Redo");
    });

    it('Test Internationalize string in Spanish', () => {

        // Test if the converted string is matching with the proper language
        expect(Globalize("es").formatMessage("core/common/Edit")).equal("Editar");
        expect(Globalize("es").formatMessage("core/common/Cut")).equal("Cortar");
        expect(Globalize("es").formatMessage("core/common/Copy")).equal("Dupdo");
        expect(Globalize("es").formatMessage("core/common/Paste")).equal("Pegar");
        expect(Globalize("es").formatMessage("core/common/Undo")).equal("Deshacer");
        expect(Globalize("es").formatMessage("core/common/Redo")).equal("Rehacer");
    });

    it('Test Internationalize string in French', () => {

        // Test if the converted string is matching with the proper language
        expect(Globalize("fr").formatMessage("core/common/Edit")).equal("Modifier");
        expect(Globalize("fr").formatMessage("core/common/Cut")).equal("Couper");
        expect(Globalize("fr").formatMessage("core/common/Copy")).equal("Copier");
        expect(Globalize("fr").formatMessage("core/common/Paste")).equal("Coller");
        expect(Globalize("fr").formatMessage("core/common/Undo")).equal("Annuler");
        expect(Globalize("fr").formatMessage("core/common/Redo")).equal("Refaire");
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
