// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { KeyCode, Key, KeyModifier, KeySequence } from './keys';
import * as os from './os';
import * as chai from 'chai';
import * as sinon from 'sinon';

const expect = chai.expect;

describe('Keys', () => {

    const equalKeyCode = (keyCode1: KeyCode, keyCode2: KeyCode): boolean =>
        JSON.stringify(keyCode1) === JSON.stringify(keyCode2);

    describe('KeySequence', () => {

        describe('#equals', () => {

            it('should return "true" when equal', () => {
                const a = new KeyCode({ key: Key.BACKSPACE });
                expect(KeySequence.equals([a], [a])).to.equal(true);
            });

            it('should return "false" when not equal', () => {
                const a = new KeyCode({ key: Key.ADD });
                const b = new KeyCode({ key: Key.SUBTRACT });
                expect(KeySequence.equals([a], [b])).to.equal(false);
            });

            it('should return "false" when the "KeySequence" have different lengths', () => {
                const a = new KeyCode({ key: Key.BACKSPACE });
                expect(KeySequence.equals([a, a], [a])).to.equal(false);
            });

        });

        describe('#compare', () => {

            it('should return "FULL" when both sequences are the same', () => {
                let a = KeySequence.parse('ctrlcmd+a t');
                let b = KeySequence.parse('ctrlcmd+a t');
                expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.FULL);

                a = KeySequence.parse('ctrlcmd+a t b');
                b = KeySequence.parse('ctrlcmd+a t b');
                expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.FULL);

            });

            it('should return "PARTIAL" when sequence a is part of b', () => {
                const a = KeySequence.parse('ctrlcmd+a');
                const b = KeySequence.parse('ctrlcmd+a t');
                expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.PARTIAL);
            });

            it('should return "SHADOW" when sequence b is part of a', () => {
                const a = KeySequence.parse('ctrlcmd+a t');
                const b = KeySequence.parse('ctrlcmd+a');
                expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.SHADOW);
            });

            it('should return "NONE" when sequence a and b do not match', () => {
                let a = KeySequence.parse('ctrlcmd+a t');
                let b = KeySequence.parse('ctrlcmd+a b c');
                expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.NONE);

                a = KeySequence.parse('ctrlcmd+a t');
                b = KeySequence.parse('ctrlcmd+a a');
                expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.NONE);
            });

            it('should work irregardless of modifier key order', () => {
                const left = KeySequence.parse('shift+alt+a');
                const right = KeySequence.parse('alt+shift+a');
                const keyCodeA = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Alt, KeyModifier.Shift] });
                const keyCodeB = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] });

                expect(KeySequence.compare(left, right)).to.be.equal(KeySequence.CompareResult.FULL);
                expect(KeySequence.compare([keyCodeA], right)).to.be.equal(KeySequence.CompareResult.FULL);
                expect(KeySequence.compare(left, [keyCodeA])).to.be.equal(KeySequence.CompareResult.FULL);
                expect(KeySequence.compare([keyCodeB], right)).to.be.equal(KeySequence.CompareResult.FULL);
                expect(KeySequence.compare(left, [keyCodeB])).to.be.equal(KeySequence.CompareResult.FULL);

            });

        });

    });

    describe('KeyCode', () => {

        describe('#parse', () => {

            it('should parse successfully', () => {
                const keycode = KeyCode.parse('ctrl+b');
                expect(keycode.ctrl).to.equal(true);
                expect(keycode.key).is.equal(Key.KEY_B);
            });

            it('should throw an error for an invalid keystroke', () => {
                expect(() => KeyCode.parse('ctl+b')).to.throw(Error);
            });

            it('should parse a string containing special modifiers to a keycode correctly', () => {
                const stub = sinon.stub(os, 'isOSX').value(false);
                const keycode = KeyCode.parse('ctrl+b');
                expect(keycode.ctrl).to.equal(true);
                expect(keycode.key).is.equal(Key.KEY_B);

                const keycodeOption = KeyCode.parse('option+b');
                expect(keycodeOption.alt).to.equal(true);
                expect(keycodeOption.key).is.equal(Key.KEY_B);

                expect(() => KeyCode.parse('cmd+b')).to.throw(/OSX only/);

                const keycodeCtrlOrCommand = KeyCode.parse('ctrlcmd+b');
                expect(keycodeCtrlOrCommand.meta).to.equal(false);
                expect(keycodeCtrlOrCommand.ctrl).to.equal(true);
                expect(keycodeCtrlOrCommand.key).is.equal(Key.KEY_B);
                stub.restore();
            });

            it('should parse a string containing special modifiers to a keycode correctly (macOS)', () => {
                KeyCode.resetKeyBindings();
                const stub = sinon.stub(os, 'isOSX').value(true);
                const keycode = KeyCode.parse('ctrl+b');
                expect(keycode.ctrl).to.equal(true);
                expect(keycode.key).is.equal(Key.KEY_B);

                const keycodeOption = KeyCode.parse('option+b');
                expect(keycodeOption.alt).to.equal(true);
                expect(keycodeOption.key).is.equal(Key.KEY_B);

                const keycodeCommand = KeyCode.parse('cmd+b');
                expect(keycodeCommand.meta).to.equal(true);
                expect(keycodeCommand.key).is.equal(Key.KEY_B);

                const keycodeCtrlOrCommand = KeyCode.parse('ctrlcmd+b');
                expect(keycodeCtrlOrCommand.meta).to.equal(true);
                expect(keycodeCtrlOrCommand.ctrl).to.equal(false);
                expect(keycodeCtrlOrCommand.key).is.equal(Key.KEY_B);

                stub.restore();
            });

            it('should serialize a keycode properly with BACKQUOTE + M1', () => {
                const stub = sinon.stub(os, 'isOSX').value(true);
                let keyCode = KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [KeyModifier.CtrlCmd] });
                let keyCodeString = keyCode.toString();
                expect(keyCodeString).to.be.equal('meta+`');
                let parsedKeyCode = KeyCode.parse(keyCodeString);
                expect(equalKeyCode(parsedKeyCode, keyCode)).to.equal(true);

                sinon.stub(os, 'isOSX').value(false);
                keyCode = KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [KeyModifier.CtrlCmd] });
                keyCodeString = keyCode.toString();
                expect(keyCodeString).to.be.equal('ctrl+`');
                parsedKeyCode = KeyCode.parse(keyCodeString);
                expect(equalKeyCode(parsedKeyCode, keyCode)).to.equal(true);

                stub.restore();
            });

            it('should serialize a keycode properly with a + M2 + M3', () => {
                const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] });
                const keyCodeString = keyCode.toString();
                expect(keyCodeString).to.be.equal('shift+alt+a');
                const parsedKeyCode = KeyCode.parse(keyCodeString);
                expect(equalKeyCode(parsedKeyCode, keyCode)).to.equal(true);
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

            it('should properly handle eventDispatch', () => {
                const event = new KeyboardEvent('keydown', {
                    code: Key.CAPS_LOCK.code,
                });
                Object.defineProperty(event, 'keyCode', { get: () => Key.ESCAPE.keyCode });
                expect(KeyCode.createKeyCode(event, 'code').toString()).to.be.equal(Key.CAPS_LOCK.easyString);
                expect(KeyCode.createKeyCode(event, 'keyCode').toString()).to.be.equal(Key.ESCAPE.easyString);
            });

            it('should serialize a keycode properly with a + M4', () => {
                const stub = sinon.stub(os, 'isOSX').value(true);
                const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.MacCtrl] });
                const keyCodeString = keyCode.toString();
                expect(keyCodeString).to.be.equal('ctrl+a');
                const parsedKeyCode = KeyCode.parse(keyCodeString);
                expect(equalKeyCode(parsedKeyCode, keyCode)).to.equal(true);
                stub.restore();
            });

            it('should parse a multi keycode keybinding', () => {
                const validKeyCodes = [];
                validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] }));
                validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd, KeyModifier.Shift] }));

                const parsedKeyCodes = KeySequence.parse('ctrlcmd+a ctrlcmd+shift+c');
                expect(parsedKeyCodes).to.deep.equal(validKeyCodes);
            });

            it('should parse a multi keycode keybinding with no modifiers', () => {
                const validKeyCodes = [];
                validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] }));
                validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C }));

                const parsedKeyCodes = KeySequence.parse('ctrlcmd+a c');
                expect(parsedKeyCodes).to.deep.equal(validKeyCodes);
            });

            it('should be a modifier only', () => {
                const keyCode = KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd] });
                expect(keyCode).to.be.deep.equal(KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd] }));
                expect(keyCode.isModifierOnly()).to.equal(true);
            });

            it('should be multiple modifiers only', () => {
                const keyCode = KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd, KeyModifier.Alt] });
                expect(keyCode).to.be.deep.equal(KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd, KeyModifier.Alt] }));
                expect(keyCode.isModifierOnly()).to.equal(true);
            });

            it('should parse a bogus keybinding', () => {
                const [first, second] = KeySequence.parse('  Ctrl+sHiFt+F10     b ');
                expect(first.ctrl).to.equal(true);
                expect(first.shift).to.equal(true);
                expect(first.key).is.equal(Key.F10);
                expect(second.key).is.equal(Key.KEY_B);
            });

            it('should parse minus as key', () => {
                const keycode = KeyCode.parse('ctrl+-');
                expect(keycode.ctrl).to.equal(true);
                expect(keycode.key).is.equal(Key.MINUS);
            });

            it('should parse minus as key and separator', () => {
                const keycode = KeyCode.parse('ctrl--');
                expect(keycode.ctrl).to.equal(true);
                expect(keycode.key).is.equal(Key.MINUS);
            });

            it('should parse plus as separator', () => {
                const keycode = KeyCode.parse('ctrl-+-');
                expect(keycode.ctrl).to.equal(true);
                expect(keycode.key).is.equal(Key.MINUS);
            });

            it('should not parse plus as key but as a separator', () => {
                const keycode = KeyCode.parse('ctrl++-');
                expect(keycode.ctrl).to.equal(true);
                expect(keycode.key).is.equal(Key.MINUS);
            });

        });

    });

});
