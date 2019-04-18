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

import { injectable, inject } from 'inversify';
import { PluginContribution, Keybinding as PluginKeybinding } from '../../../common';
import { Keybinding, KeybindingRegistry, KeybindingScope } from '@theia/core/lib/browser/keybinding';
import { ILogger } from '@theia/core/lib/common/logger';
import { OS } from '@theia/core/lib/common/os';

@injectable()
export class KeybindingsContributionPointHandler {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(KeybindingRegistry)
    private readonly keybindingRegistry: KeybindingRegistry;

    handle(contributions: PluginContribution): void {
        if (!contributions || !contributions.keybindings) {
            return;
        }
        const keybindings: Keybinding[] = [];
        for (const raw of contributions.keybindings) {
            const keybinding = this.toKeybinding(raw);
            if (keybinding) {
                try {
                    const bindingKeySequence = this.keybindingRegistry.resolveKeybinding(keybinding);
                    const keybindingResult = this.keybindingRegistry.getKeybindingsForKeySequence(bindingKeySequence);
                    this.handleShadingKeybindings(keybinding, keybindingResult.shadow);
                    this.handlePartialKeybindings(keybinding, keybindingResult.partial);
                    keybindings.push(keybinding);
                } catch (e) {
                    this.logger.error(e.message || e);
                }
            }
        }
        this.keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);
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

    private handlePartialKeybindings(keybinding: Keybinding, partialKeybindings: Keybinding[]) {
        partialKeybindings.forEach(partial => {
            if (keybinding.context === undefined || keybinding.context === partial.context) {
                this.logger.warn(`Partial keybinding is ignored; ${Keybinding.stringify(keybinding)} shadows ${Keybinding.stringify(partial)}`);
            }
        });
    }

    private handleShadingKeybindings(keybinding: Keybinding, shadingKeybindings: Keybinding[]) {
        shadingKeybindings.forEach(shadow => {
            if (shadow.context === undefined || shadow.context === keybinding.context) {
                this.keybindingRegistry.unregisterKeybinding(shadow);

                this.logger.warn(`Shadowing keybinding is ignored; ${Keybinding.stringify(shadow)}, shadows ${Keybinding.stringify(keybinding)}`);
            }
        });
    }
}
