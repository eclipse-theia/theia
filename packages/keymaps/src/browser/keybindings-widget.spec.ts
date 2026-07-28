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
const disableJSDOM = enableJSDOM();
if (typeof DragEvent === 'undefined') {
    Object.assign(globalThis, { DragEvent: class extends Event { } });
}

import * as chai from 'chai';
import * as sinon from 'sinon';
import * as os from '@theia/core/lib/common/os';
import { Key, KeyCode } from '@theia/core/lib/browser/keyboard/keys';
import { KeybindingRegistry, ScopedKeybinding } from '@theia/core/lib/browser/keybinding';
import { keybindingTooltip } from './keybinding-tooltip';
import { recordedKeybindingStroke } from './keybindings-widget';

after(() => disableJSDOM());

describe('keybindings widget tooltip', () => {
    const binding = { command: 'test', keybinding: 'ctrl+[', scope: 0 } as ScopedKeybinding;

    it('shows a logical binding and its real physical realization', () => {
        const platform = sinon.stub(os, 'isOSX').value(false);
        const registry = Object.create(KeybindingRegistry.prototype) as KeybindingRegistry;
        const code = new KeyCode({
            key: Key.DIGIT8,
            ctrl: true,
            character: '[',
            production: { altGraph: true }
        });
        Object.defineProperty(registry, 'keyboardLayoutService', {
            value: { getKeyboardCharacter: (key: Key) => key.easyString }
        });
        registry.resolveKeybinding = () => [code];
        registry.getKeybindingInactiveReason = () => undefined;
        registry.getInterpretationShadowing = () => [];

        chai.expect(registry.componentsForKeyCode(code)).to.deep.equal(['Ctrl', '[']);
        chai.expect(keybindingTooltip(registry, binding)).to.equal('Ctrl+AltGr+8');
        platform.restore();
    });

    it('keeps inactive character-only bindings visible in logical labels', () => {
        const platform = sinon.stub(os, 'isOSX').value(false);
        const registry = Object.create(KeybindingRegistry.prototype) as KeybindingRegistry;
        const code = new KeyCode({ ctrl: true, character: '§', resolved: false });
        Object.defineProperty(registry, 'keyboardLayoutService', {
            value: { getKeyboardCharacter: (key: Key) => key.easyString }
        });

        chai.expect(registry.componentsForKeyCode(code)).to.deep.equal(['Ctrl', '§']);
        platform.restore();
    });

    it('does not advertise a physical realization for inactive bindings', () => {
        const registry = {
            resolveKeybinding: () => [new KeyCode({ key: Key.BRACKET_LEFT, ctrl: true, character: '[', resolved: false })],
            getKeybindingInactiveReason: () => 'The key is not available on the current keyboard layout.',
            physicalComponentsForKeyCode: () => ['Ctrl', '['],
            getInterpretationShadowing: () => []
        } as unknown as KeybindingRegistry;

        chai.expect(keybindingTooltip(registry, binding)).to.equal(
            'Physical realization unavailable\nThe key is not available on the current keyboard layout.'
        );
    });

    it('captures logical characters, physical non-printables, and ignores modifier-only input', () => {
        const registry = {
            canonicalKeyCodeForKeyboardInput: (event: KeyboardEvent) => {
                if (event.code === 'ControlLeft') {
                    return new KeyCode({ ctrl: true });
                }
                if (event.code === 'F1') {
                    return new KeyCode({ key: Key.F1, ctrl: true });
                }
                if (event.code === 'KeyP') {
                    return new KeyCode({ key: Key.KEY_P, ctrl: true, shift: true, character: 'P' });
                }
                return new KeyCode({ key: event.code === 'Equal' ? Key.EQUAL : Key.BRACKET_LEFT, ctrl: true, character: event.key });
            }
        } as unknown as KeybindingRegistry;

        chai.expect(recordedKeybindingStroke(registry, new KeyboardEvent('keydown', { key: '[', code: 'Digit8', ctrlKey: true }))).to.equal('ctrl+[');
        chai.expect(recordedKeybindingStroke(registry, new KeyboardEvent('keydown', { key: '+', code: 'Equal', ctrlKey: true }))).to.equal('ctrl+[char:0x2B]');
        chai.expect(recordedKeybindingStroke(registry, new KeyboardEvent('keydown', { key: 'F1', code: 'F1', ctrlKey: true }))).to.equal('ctrl+[F1]');
        const shifted = recordedKeybindingStroke(registry, new KeyboardEvent('keydown', { key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true }));
        chai.expect(shifted).to.equal('shift+ctrl+p');
        chai.expect(KeyCode.parse(shifted!).dispatchString()).to.equal('shift+ctrl+p');
        chai.expect(recordedKeybindingStroke(registry, new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true }))).to.be.undefined;
    });
});
