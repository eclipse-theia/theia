/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { MonacoCommands } from './monaco-command';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { environment } from '@theia/core';
import { MonacoResolvedKeybinding } from './monaco-resolved-keybinding';

@injectable()
export class MonacoKeybindingContribution implements KeybindingContribution {

    @inject(MonacoCommandRegistry)
    protected readonly commands: MonacoCommandRegistry;

    registerKeybindings(registry: KeybindingRegistry): void {
        const defaultKeybindings = monaco.keybindings.KeybindingsRegistry.getDefaultKeybindings();
        // register in reverse order to align with Monaco dispatch logic:
        // https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/platform/keybinding/common/keybindingResolver.ts#L302
        for (let i = defaultKeybindings.length - 1; i >= 0; i--) {
            const item = defaultKeybindings[i];
            const command = this.commands.validate(item.command);
            if (command) {
                const when = item.when && item.when.serialize();
                let keybinding;
                if (item.command === MonacoCommands.GO_TO_DEFINITION && !environment.electron.is()) {
                    keybinding = 'ctrlcmd+f11';
                } else {
                    keybinding = MonacoResolvedKeybinding.toKeybinding(item.keybinding);
                }
                registry.registerKeybinding({ command, keybinding, when });
            }
        }
    }
}
