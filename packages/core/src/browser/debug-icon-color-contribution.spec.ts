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
import { DebugIconColorContribution } from './debug-icon-color-contribution.js';

class RecordingColorRegistry extends ColorRegistry {

    readonly definitions = new Map<string, ColorDefinition>();

    protected override doRegister(definition: ColorDefinition): Disposable {
        this.definitions.set(definition.id, definition);
        return Disposable.NULL;
    }
}

describe('DebugIconColorContribution', () => {

    let registry: RecordingColorRegistry;

    beforeEach(() => {
        registry = new RecordingColorRegistry();
        new DebugIconColorContribution().registerColors(registry);
    });

    it('registers the debug start and stop icon colors', () => {
        expect([...registry.definitions.keys()]).to.have.members([
            'debugIcon.startForeground',
            'debugIcon.stopForeground'
        ]);
    });

    it('keeps the debug start icon colors', () => {
        expect(registry.definitions.get('debugIcon.startForeground')?.defaults).to.deep.equal({
            dark: '#89D185',
            light: '#388A34',
            hcDark: '#89D185',
            hcLight: '#388A34'
        });
    });

    it('keeps the debug stop icon colors', () => {
        expect(registry.definitions.get('debugIcon.stopForeground')?.defaults).to.deep.equal({
            dark: '#F48771',
            light: '#A1260D',
            hcDark: '#F48771',
            hcLight: '#A1260D'
        });
    });
});
