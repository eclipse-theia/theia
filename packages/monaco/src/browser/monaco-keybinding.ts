// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { KeybindingContribution, KeybindingRegistry, KeybindingScope, KeyCode } from '@theia/core/lib/browser';
import { MonacoCommands } from './monaco-command';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { CommandRegistry, DisposableCollection, environment, isOSX } from '@theia/core';
import { MonacoResolvedKeybinding } from './monaco-resolved-keybinding';
import { KeybindingsRegistry } from '@theia/monaco-editor-core/esm/vs/platform/keybinding/common/keybindingsRegistry';
import { StandaloneKeybindingService, StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IKeybindingService } from '@theia/monaco-editor-core/esm/vs/platform/keybinding/common/keybinding';
import { MonacoContextKeyService } from './monaco-context-key-service';
import { KEY_CODE_MAP } from './monaco-keycode-map';
import * as monaco from '@theia/monaco-editor-core';

@injectable()
export class MonacoKeybindingContribution implements KeybindingContribution {

    protected toDisposeOnKeybindingChange = new DisposableCollection();

    @inject(MonacoCommandRegistry) protected readonly commands: MonacoCommandRegistry;
    @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry;
    @inject(CommandRegistry) protected readonly theiaCommandRegistry: CommandRegistry;
    @inject(MonacoContextKeyService) protected readonly contextKeyService: MonacoContextKeyService;

    @postConstruct()
    protected init(): void {
        this.keybindings.onKeybindingsChanged(() => this.updateMonacoKeybindings());
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        const defaultKeybindings = KeybindingsRegistry.getDefaultKeybindings();
        for (const item of defaultKeybindings) {
            const command = this.commands.validate(item.command || undefined);
            if (command && item.keybinding) {
                const when = (item.when && item.when.serialize()) ?? undefined;
                let keybinding;
                if (item.command === MonacoCommands.GO_TO_DEFINITION && !environment.electron.is()) {
                    keybinding = 'ctrlcmd+f11';
                } else {
                    keybinding = MonacoResolvedKeybinding.toKeybinding(item.keybinding.chords);
                }
                registry.registerKeybinding({ command, keybinding, when });
            }
        }
    }

    protected updateMonacoKeybindings(): void {
        const monacoKeybindingRegistry = StandaloneServices.get(IKeybindingService);
        if (monacoKeybindingRegistry instanceof StandaloneKeybindingService) {
            this.toDisposeOnKeybindingChange.dispose();
            for (const binding of this.keybindings.getKeybindingsByScope(KeybindingScope.USER).concat(this.keybindings.getKeybindingsByScope(KeybindingScope.WORKSPACE))) {
                const resolved = this.keybindings.resolveKeybinding(binding);
                const command = binding.command;
                const when = binding.when
                    ? this.contextKeyService.parse(binding.when)
                    : binding.context
                        ? this.contextKeyService.parse(binding.context)
                        : undefined;
                this.toDisposeOnKeybindingChange.push(monacoKeybindingRegistry.addDynamicKeybinding(
                    binding.command,
                    this.toMonacoKeybindingNumber(resolved),
                    (_, ...args) => this.theiaCommandRegistry.executeCommand(command, ...args),
                    when,
                ));
            }
        }
    }

    protected toMonacoKeybindingNumber(codes: KeyCode[]): number {
        const [firstPart, secondPart] = codes;
        if (codes.length > 2) {
            console.warn('Key chords should not consist of more than two parts; got ', codes);
        }
        const encodedFirstPart = this.toSingleMonacoKeybindingNumber(firstPart);
        const encodedSecondPart = secondPart ? this.toSingleMonacoKeybindingNumber(secondPart) << 16 : 0;
        return monaco.KeyMod.chord(encodedFirstPart, encodedSecondPart);
    }

    protected toSingleMonacoKeybindingNumber(code: KeyCode): number {
        const keyCode = code.key?.keyCode !== undefined ? KEY_CODE_MAP[code.key.keyCode] : 0;
        let encoded = (keyCode >>> 0) & 0x000000FF;
        if (code.alt) {
            encoded |= monaco.KeyMod.Alt;
        }
        if (code.shift) {
            encoded |= monaco.KeyMod.Shift;
        }
        if (code.ctrl) {
            encoded |= monaco.KeyMod.WinCtrl;
        }
        if (code.meta && isOSX) {
            encoded |= monaco.KeyMod.CtrlCmd;
        }
        return encoded;
    }
}
