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
import { EditorGutterColorContribution } from './editor-gutter-color-contribution.js';

class RecordingColorRegistry extends ColorRegistry {

    readonly definitions = new Map<string, ColorDefinition>();

    protected override doRegister(definition: ColorDefinition): Disposable {
        this.definitions.set(definition.id, definition);
        return Disposable.NULL;
    }
}

describe('EditorGutterColorContribution', () => {

    let registry: RecordingColorRegistry;

    beforeEach(() => {
        registry = new RecordingColorRegistry();
        new EditorGutterColorContribution().registerColors(registry);
    });

    it('registers the editor gutter and overview ruler change colors', () => {
        expect([...registry.definitions.keys()]).to.have.members([
            'editorGutter.modifiedBackground',
            'editorGutter.addedBackground',
            'editorGutter.deletedBackground',
            'editorOverviewRuler.modifiedForeground',
            'editorOverviewRuler.addedForeground',
            'editorOverviewRuler.deletedForeground'
        ]);
    });

    it('keeps the editor gutter colors', () => {
        expect(registry.definitions.get('editorGutter.modifiedBackground')?.defaults).to.deep.equal({
            dark: '#1B81A8',
            light: '#2090D3',
            hcDark: '#1B81A8',
            hcLight: '#2090D3'
        });
        expect(registry.definitions.get('editorGutter.addedBackground')?.defaults).to.deep.equal({
            dark: '#487E02',
            light: '#48985D',
            hcDark: '#487E02',
            hcLight: '#48985D'
        });
        expect(registry.definitions.get('editorGutter.deletedBackground')?.defaults).to.deep.equal({
            dark: 'editorError.foreground',
            light: 'editorError.foreground',
            hcDark: 'editorError.foreground',
            hcLight: 'editorError.foreground'
        });
    });

    it('derives the overview ruler colors from the gutter colors', () => {
        const transparentGutter = (id: string) => ({ kind: 'transparent', v: id, f: 0.6 });
        for (const change of ['modified', 'added', 'deleted']) {
            const expected = transparentGutter(`editorGutter.${change}Background`);
            expect(registry.definitions.get(`editorOverviewRuler.${change}Foreground`)?.defaults).to.deep.equal({
                dark: expected,
                light: expected,
                hcDark: expected,
                hcLight: expected
            });
        }
    });
});
