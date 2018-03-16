/**
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import parseKeybindings from '../common/keymaps-validation';
import { Keybinding } from '@theia/core/lib/browser';
import * as chai from 'chai';

const expect = chai.expect;

describe('keymaps', () => {
    let keybindings: Keybinding[];
    before(() => {
        keybindings = [];
    });

    it('parsing keybindings from well formatted raw text', () => {
        keybindings.push(...parseKeybindings(goodContent));
        expect(keybindings).to.have.length(2);
    });

    it('parsing keybindings from malformatted raw text', () => {
        for (const [badContent, errorMessage] of badContents) {
            try {
                parseKeybindings(badContent);
            } catch (error) {
                expect(error.messages.length).to.be.greaterThan(0);
                continue;
            }
            throw new Error(`${errorMessage}\n Content:\n ${badContent}`);
        }
    });
});

const goodContent = `[
    {
        "keybinding": "ctrl+p",
        "command": "command1"
    },
    {
        "keybinding": "ctrl+shift+p",
        "command": "command2"
    }
]`;

const notListContent = `{
    "keybinding": "ctrl+p",
    "command": "command"
}`;

const extraKeyContent = `[
    {
        "keybinding": "ctrl+p",
        "command": "command",
        "extra": 0
    }
]`;

const wrongTypeContent = `[
    {
        "keybinding": 0,
        "command": "command1"
    },
    {
        "keybinding": "ctrl+shift+p",
        "command": 0
    }
]`;

const missingKeyContent = `[
    {
        "keybinding": "ctrl+p",
    }
]`;

// [badContent, errorMessage]
const badContents = [
    [notListContent, `content is not a list and should fail, yet it doesn't`],
    [wrongTypeContent, `content defines the wrong data types and should fail, yet it doesn't`],
    [extraKeyContent, `content is has an extra key and should fail, yet it doesn't`],
    [missingKeyContent, `"command" value missing and should fail, yet it doesn't`],
];
