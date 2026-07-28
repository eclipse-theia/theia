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
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import type { ScopedKeybinding } from '@theia/core/lib/browser/keybinding';
import { keybindingTooltip } from './keybinding-tooltip';

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

        chai.expect(registry.componentsForKeyCode(code)).to.deep.equal(['Ctrl', '[']);
        chai.expect(keybindingTooltip(registry, binding)).to.equal('Ctrl+AltGr+8');
        platform.restore();
    });

    it('does not advertise a physical realization for inactive bindings', () => {
        const registry = {
            resolveKeybinding: () => [new KeyCode({ key: Key.BRACKET_LEFT, ctrl: true, character: '[', resolved: false })],
            getKeybindingInactiveReason: () => 'The key is not available on the current keyboard layout.',
            physicalComponentsForKeyCode: () => ['Ctrl', '[']
        } as unknown as KeybindingRegistry;

        chai.expect(keybindingTooltip(registry, binding)).to.equal(
            'Physical realization unavailable\nThe key is not available on the current keyboard layout.'
        );
    });
});
