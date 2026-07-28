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
import { pluginMenuAccelerator } from './plugin-menu-accelerator';

describe('Plugin menu accelerators', () => {
    it('honors the physical accelerator form requested by Electron', () => {
        const binding = { command: 'plugin.command', keybinding: 'ctrl+[' };
        const keybindingRegistry = {
            getKeybindingsForCommand: () => [binding],
            isEnabledInScope: () => true,
            getKeybindingInactiveReason: () => undefined,
            acceleratorFor: () => ['Ctrl+['],
            physicalAcceleratorFor: () => ['Ctrl+AltGr+8']
        };

        expect(pluginMenuAccelerator(keybindingRegistry as never, 'plugin.command', undefined, 'logical')).to.deep.equal(['Ctrl+[']);
        expect(pluginMenuAccelerator(keybindingRegistry as never, 'plugin.command', undefined, 'physical')).to.deep.equal(['Ctrl+AltGr+8']);
    });
});
