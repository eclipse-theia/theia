// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Key, KeybindingRegistry, KeyCode } from '@theia/core/lib/browser';
import * as os from '@theia/core/lib/common/os';
import * as monaco from '@theia/monaco-editor-core';
import * as sinon from 'sinon';
import { MonacoKeybindingContribution } from './monaco-keybinding';
import { MonacoResolvedKeybinding } from './monaco-resolved-keybinding';

class TestMonacoKeybindingContribution extends MonacoKeybindingContribution {
    encode(code: KeyCode): number {
        return this.toSingleMonacoKeybindingNumber(code);
    }

    representable(codes: KeyCode[]): boolean {
        return this.isMonacoRepresentable(codes);
    }
}

disableJSDOM();

describe('Monaco keybinding adapter', () => {
    let contribution: TestMonacoKeybindingContribution;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => contribution = new TestMonacoKeybindingContribution());

    afterEach(() => sinon.restore());

    it('encodes non-macOS Ctrl as Monaco CtrlCmd', () => {
        sinon.stub(os, 'isOSX').value(false);

        const encoded = contribution.encode(new KeyCode({ key: Key.KEY_A, ctrl: true }));

        expect(encoded & monaco.KeyMod.CtrlCmd).to.equal(monaco.KeyMod.CtrlCmd);
        expect(encoded & monaco.KeyMod.WinCtrl).to.equal(0);
    });

    it('preserves macOS Ctrl and Command encoding', () => {
        sinon.stub(os, 'isOSX').value(true);

        const encoded = contribution.encode(new KeyCode({ key: Key.KEY_A, ctrl: true, meta: true }));

        expect(encoded & monaco.KeyMod.WinCtrl).to.equal(monaco.KeyMod.WinCtrl);
        expect(encoded & monaco.KeyMod.CtrlCmd).to.equal(monaco.KeyMod.CtrlCmd);
    });

    it('accepts production Shift but rejects production AltGraph and unmapped keys', () => {
        expect(contribution.representable([
            new KeyCode({ key: Key.DIGIT7, production: { shift: true } })
        ])).to.be.true;
        expect(contribution.representable([
            new KeyCode({ key: Key.DIGIT8, production: { altGraph: true } })
        ])).to.be.false;
        expect(contribution.representable([new KeyCode({ key: Key.F20 })])).to.be.false;
    });

    it('uses formatted logical characters in resolved labels', () => {
        sinon.stub(os, 'isOSX').value(false);
        const registry = Object.create(KeybindingRegistry.prototype) as KeybindingRegistry;
        const bracket = new MonacoResolvedKeybinding([
            new KeyCode({ key: Key.DIGIT8, ctrl: true, character: '[', production: { altGraph: true } })
        ], registry);
        const letter = new MonacoResolvedKeybinding([
            new KeyCode({ key: Key.KEY_P, ctrl: true, character: 'p' })
        ], registry);

        expect(bracket.getLabel()).to.equal('Ctrl+[');
        expect(letter.getLabel()).to.equal('Ctrl+P');
    });
});
