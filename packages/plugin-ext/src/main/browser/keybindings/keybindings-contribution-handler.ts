/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { PluginContribution, Keybinding as PluginKeybinding } from '../../../common';
import { Keybinding } from '@theia/core/lib/common/keybinding';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { OS } from '@theia/core/lib/common/os';
import { Disposable } from '@theia/core/lib/common/disposable';
import { DisposableCollection } from '@theia/core';

@injectable()
export class KeybindingsContributionPointHandler {

    @inject(KeybindingRegistry)
    private readonly keybindingRegistry: KeybindingRegistry;

    handle(contributions: PluginContribution): Disposable {
        if (!contributions || !contributions.keybindings) {
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection();
        for (const raw of contributions.keybindings) {
            const keybinding = this.toKeybinding(raw);
            if (keybinding) {
                toDispose.push(this.keybindingRegistry.registerKeybinding(keybinding));
            }
        }
        return toDispose;
    }

    protected toKeybinding(pluginKeybinding: PluginKeybinding): Keybinding | undefined {
        const keybinding = this.toOSKeybinding(pluginKeybinding);
        if (!keybinding) {
            return undefined;
        }
        const { command, when } = pluginKeybinding;
        return { keybinding, command, when };
    }

    protected toOSKeybinding(pluginKeybinding: PluginKeybinding): string | undefined {
        let keybinding: string | undefined;
        const os = OS.type();
        if (os === OS.Type.Windows) {
            keybinding = pluginKeybinding.win;
        } else if (os === OS.Type.OSX) {
            keybinding = pluginKeybinding.mac;
        } else {
            keybinding = pluginKeybinding.linux;
        }
        return keybinding || pluginKeybinding.keybinding;
    }
}
