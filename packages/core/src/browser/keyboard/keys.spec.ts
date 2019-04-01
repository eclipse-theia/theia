/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { enableJSDOM } from '../../browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { KeyCode, Key, KeyModifier, KeySequence } from './keys';
import * as os from '../../common/os';
import * as chai from 'chai';
import * as sinon from 'sinon';

disableJSDOM();

/* tslint:disable:no-unused-expression */

const expect = chai.expect;

describe('keys api', () => {
    const equalKeyCode = (keyCode1: KeyCode, keyCode2: KeyCode): boolean =>
        JSON.stringify(keyCode1) === JSON.stringify(keyCode2);

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('should parse a string to a KeyCode correctly', () => {

        const keycode = KeyCode.parse('ctrl+b');
        expect(keycode.ctrl).to.be.true;
        expect(keycode.key).is.equal(Key.KEY_B);

        // Invalid keystroke string
        expect(() => KeyCode.parse('ctl+b')).to.throw(Error);

    });

    it('should parse a string containing special modifiers to a KeyCode correctly', () => {
        const stub = sinon.stub(os, 'isOSX').value(false);
        const keycode = KeyCode.parse('ctrl+b');
        expect(keycode.ctrl).to.be.true;
        expect(keycode.key).is.equal(Key.KEY_B);

        const keycodeOption = KeyCode.parse('option+b');
        expect(keycodeOption.alt).to.be.true;
        expect(keycodeOption.key).is.equal(Key.KEY_B);

        expect(() => KeyCode.parse('cmd+b')).to.throw(/OSX only/);

        const keycodeCtrlOrCommand = KeyCode.parse('ctrlcmd+b');
        expect(keycodeCtrlOrCommand.meta).to.be.false;
        expect(keycodeCtrlOrCommand.ctrl).to.be.true;
        expect(keycodeCtrlOrCommand.key).is.equal(Key.KEY_B);
        stub.restore();
    });

    it('should parse a string containing special modifiers to a KeyCode correctly (macOS)', () => {
        KeyCode.resetKeyBindings();
        const stub = sinon.stub(os, 'isOSX').value(true);
        const keycode = KeyCode.parse('ctrl+b');
        expect(keycode.ctrl).to.be.true;
        expect(keycode.key).is.equal(Key.KEY_B);

        const keycodeOption = KeyCode.parse('option+b');
        expect(keycodeOption.alt).to.be.true;
        expect(keycodeOption.key).is.equal(Key.KEY_B);

        const keycodeCommand = KeyCode.parse('cmd+b');
        expect(keycodeCommand.meta).to.be.true;
        expect(keycodeCommand.key).is.equal(Key.KEY_B);

        const keycodeCtrlOrCommand = KeyCode.parse('ctrlcmd+b');
        expect(keycodeCtrlOrCommand.meta).to.be.true;
        expect(keycodeCtrlOrCommand.ctrl).to.be.false;
        expect(keycodeCtrlOrCommand.key).is.equal(Key.KEY_B);

        stub.restore();
    });

    it('should serialize a keycode properly with BACKQUOTE + M1', () => {
        const stub = sinon.stub(os, 'isOSX').value(true);
        let keyCode = KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [KeyModifier.CtrlCmd] });
        let keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal('meta+`');
        let parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(equalKeyCode(parsedKeyCode, keyCode)).to.be.true;

        sinon.stub(os, 'isOSX').value(false);
        keyCode = KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [KeyModifier.CtrlCmd] });
        keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal('ctrl+`');
        parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(equalKeyCode(parsedKeyCode, keyCode)).to.be.true;

        stub.restore();
    });

    it('should serialize a keycode properly with a + M2 + M3', () => {
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] });
        const keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal('shift+alt+a');
        const parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(equalKeyCode(parsedKeyCode, keyCode)).to.be.true;
    });

    it('the order of the modifiers should not matter when parsing the key code', () => {
        const left = KeySequence.parse('shift+alt+a');
        const right = KeySequence.parse('alt+shift+a');
        expect(KeySequence.compare(left, right)).to.be.equal(KeySequence.CompareResult.FULL);

        expect(KeySequence.compare(
            [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Alt, KeyModifier.Shift] })], right)).to.be.equal(
                KeySequence.CompareResult.FULL);
        expect(KeySequence.compare(
            left, [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Alt, KeyModifier.Shift] })])).to.be.equal(
                KeySequence.CompareResult.FULL);

        expect(KeySequence.compare(
            [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] })], right)).to.be.equal(
                KeySequence.CompareResult.FULL);
        expect(KeySequence.compare(
            left, [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] })])).to.be.equal(
                KeySequence.CompareResult.FULL);
    });

    it('should parse ctrl key properly on both OS X and other platforms', () => {
        const event = new KeyboardEvent('keydown', {
            key: Key.BACKQUOTE.easyString,
            code: Key.BACKQUOTE.code,
            ctrlKey: true,
        });
        const stub = sinon.stub(os, 'isOSX').value(true);
        expect(KeyCode.createKeyCode(event).toString()).to.be.equal('ctrl+`');
        sinon.stub(os, 'isOSX').value(false);
        expect(KeyCode.createKeyCode(event).toString()).to.be.equal('ctrl+`');
        stub.restore();
    });

    it('should serialize a keycode properly with a + M4', () => {
        const stub = sinon.stub(os, 'isOSX').value(true);
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.MacCtrl] });
        const keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal('ctrl+a');
        const parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(equalKeyCode(parsedKeyCode, keyCode)).to.be.true;
        stub.restore();
    });

    it('it should parse a multi keycode keybinding', () => {
        const validKeyCodes = [];
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] }));
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd, KeyModifier.Shift] }));

        const parsedKeyCodes = KeySequence.parse('ctrlcmd+a ctrlcmd+shift+c');
        expect(parsedKeyCodes).to.deep.equal(validKeyCodes);
    });

    it('it should parse a multi keycode keybinding with no modifiers', () => {
        const validKeyCodes = [];
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] }));
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C }));

        const parsedKeyCodes = KeySequence.parse('ctrlcmd+a c');
        expect(parsedKeyCodes).to.deep.equal(validKeyCodes);
    });

    it('should compare keysequences properly', () => {
        let a = KeySequence.parse('ctrlcmd+a');
        let b = KeySequence.parse('ctrlcmd+a t');

        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.PARTIAL);

        a = KeySequence.parse('ctrlcmd+a t');
        b = KeySequence.parse('ctrlcmd+a');

        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.SHADOW);

        a = KeySequence.parse('ctrlcmd+a t');
        b = KeySequence.parse('ctrlcmd+a b c');
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.NONE);

        a = KeySequence.parse('ctrlcmd+a t');
        b = KeySequence.parse('ctrlcmd+a a');
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.NONE);

        a = KeySequence.parse('ctrlcmd+a t');
        b = KeySequence.parse('ctrlcmd+a t');
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.FULL);

        a = KeySequence.parse('ctrlcmd+a t b');
        b = KeySequence.parse('ctrlcmd+a t b');
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.FULL);
    });

    it('should be a modifier only', () => {
        const keyCode = KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd] });
        expect(keyCode).to.be.deep.equal(KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd] }));
        expect(keyCode.isModifierOnly()).to.be.true;
    });

    it('should be multiple modifiers only', () => {
        const keyCode = KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd, KeyModifier.Alt] });
        expect(keyCode).to.be.deep.equal(KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd, KeyModifier.Alt] }));
        expect(keyCode.isModifierOnly()).to.be.true;
    });

    it('parse bogus keybinding', () => {
        const [first, second] = KeySequence.parse('  Ctrl+sHiFt+F10     b ');
        expect(first.ctrl).to.be.true;
        expect(first.shift).to.be.true;
        expect(first.key).is.equal(Key.F10);
        expect(second.key).is.equal(Key.KEY_B);
    });
});
