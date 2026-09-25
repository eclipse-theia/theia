// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { Key, KeyCode } from '../keyboard/keys';
import { KeybindingRegistry } from '../keybinding';
import { ActionMenuNode } from './action-menu-node';

describe('ActionMenuNode accelerators', () => {
    it('selects logical and physical accelerator forms explicitly', () => {
        const binding = { command: 'test.command', keybinding: 'ctrl+[' };
        const state = { inactive: false };
        const keybindingRegistry = Object.create(KeybindingRegistry.prototype) as KeybindingRegistry;
        keybindingRegistry.getKeybindingsForCommand = () => [{ ...binding, scope: 0 }];
        keybindingRegistry.isEnabledInScope = () => true;
        keybindingRegistry.isKeybindingInactive = () => state.inactive;
        keybindingRegistry.resolveKeybinding = () => [new KeyCode({
            key: Key.DIGIT8,
            ctrl: true,
            character: '[',
            layoutModifiers: 'altGraph'
        })];
        Object.defineProperty(keybindingRegistry, 'keyboardLayoutService', {
            value: { getKeyboardCharacter: (key: Key) => key.easyString }
        });
        const commands = {
            getAllHandlers: () => [],
            getCommand: () => ({ id: 'test.command' })
        };
        const contextKeyService = {
            parseKeys: () => undefined
        };
        const node = new ActionMenuNode(
            { commandId: 'test.command' },
            commands as never,
            keybindingRegistry,
            contextKeyService as never
        );

        expect(node.getAccelerator(undefined, 'logical')).to.deep.equal(['Ctrl+[']);
        expect(node.getAccelerator(undefined, 'physical')).to.deep.equal(['Ctrl+AltGr+8']);

        state.inactive = true;
        expect(node.getAccelerator(undefined, 'logical')).to.deep.equal(['Ctrl+[']);
        expect(node.getAccelerator(undefined, 'physical')).to.deep.equal([]);
    });
});
