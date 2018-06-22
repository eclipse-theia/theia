/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
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
