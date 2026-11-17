// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { Disposable } from '../common/disposable.js';
import { ColorDefinition } from '../common/color.js';
import { ColorRegistry } from './color-registry.js';
import { TerminalAnsiColorContribution } from './terminal-ansi-color-contribution.js';

class RecordingColorRegistry extends ColorRegistry {

    readonly definitions = new Map<string, ColorDefinition>();

    protected override doRegister(definition: ColorDefinition): Disposable {
        this.definitions.set(definition.id, definition);
        return Disposable.NULL;
    }
}

describe('TerminalAnsiColorContribution', () => {

    let registry: RecordingColorRegistry;

    beforeEach(() => {
        registry = new RecordingColorRegistry();
        new TerminalAnsiColorContribution().registerColors(registry);
    });

    it('registers the 16 terminal ANSI colors', () => {
        const names = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];
        const expected = [...names.map(name => `terminal.ansi${name}`), ...names.map(name => `terminal.ansiBright${name}`)];
        expect([...registry.definitions.keys()]).to.have.members(expected);
    });

    it('uses the VS Code default colors', () => {
        expect(registry.definitions.get('terminal.ansiGreen')?.defaults).to.deep.equal({
            light: '#00BC00',
            dark: '#0DBC79',
            hcDark: '#00cd00',
            hcLight: '#00bc00'
        });
        expect(registry.definitions.get('terminal.ansiBrightWhite')?.defaults).to.deep.equal({
            light: '#a5a5a5',
            dark: '#e5e5e5',
            hcDark: '#ffffff',
            hcLight: '#a5a5a5'
        });
    });
});
