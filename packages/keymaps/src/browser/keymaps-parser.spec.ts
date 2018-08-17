/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as assert from 'assert';
import { KeymapsParser } from './keymaps-parser';

describe('keymaps-parser', () => {

    const parser = new KeymapsParser();

    it('well formatted raw text', () => {
        assertParsing(`{
  "keybindings": [
    {
      "keybinding": "ctrl+p",
      "command": "command1"
    },
    {
      "keybinding": "ctrl+shift+p",
      "command": "command2"
    }
  ],
  "errors": []
}`, `[
    {
        "keybinding": "ctrl+p",
        "command": "command1"
    },
    {
        "keybinding": "ctrl+shift+p",
        "command": "command2"
    }
]`);
    });

    it('no array', () => {
        assertParsing(`{
  "keybindings": [],
  "errors": [
    "should be array at "
  ]
}`, `{
    "keybinding": "ctrl+p",
    "command": "command"
}`);
    });

    it('additional property', () => {
        assertParsing(`{
  "keybindings": [],
  "errors": [
    "should NOT have additional properties at /0"
  ]
}`, `[
    {
        "keybinding": "ctrl+p",
        "command": "command",
        "extra": 0
    }
]`);
    });

    it('wrong type', () => {
        assertParsing(`{
  "keybindings": [],
  "errors": [
    "should be string at /0/keybinding"
  ]
}`, `[
    {
        "keybinding": 0,
        "command": "command1"
    },
    {
        "keybinding": "ctrl+shift+p",
        "command": 0
    }
]`);
    });

    it('missing property', () => {
        assertParsing(`{
  "keybindings": [],
  "errors": [
    "PropertyNameExpected at 44 offset of 1 length",
    "ValueExpected at 44 offset of 1 length",
    "should have required property 'command' at /0"
  ]
}`, `[
    {
        "keybinding": "ctrl+p",
    }
]`);
    });

    function assertParsing(expectation: string, content: string): void {
        const errors: string[] = [];
        const keybindings = parser.parse(content, errors);
        assert.deepEqual(expectation, JSON.stringify({ keybindings, errors }, undefined, 2));
    }

});
