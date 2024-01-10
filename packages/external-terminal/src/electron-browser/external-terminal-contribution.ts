// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { KeybindingContribution, KeybindingRegistry, LabelProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ExternalTerminalService } from '../common/external-terminal';
import { ExternalTerminalPreferenceService } from './external-terminal-preference';
import { QuickPickService } from '@theia/core/lib/common/quick-pick-service';
import { nls } from '@theia/core/lib/common/nls';

export namespace ExternalTerminalCommands {
    export const OPEN_NATIVE_CONSOLE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.terminal.openNativeConsole',
        label: 'Open New External Terminal'
    });
}

@injectable()
export class ExternalTerminalFrontendContribution implements CommandContribution, KeybindingContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    @inject(ExternalTerminalService)
    protected readonly externalTerminalService: ExternalTerminalService;

    @inject(ExternalTerminalPreferenceService)
    protected readonly externalTerminalPreferences: ExternalTerminalPreferenceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ExternalTerminalCommands.OPEN_NATIVE_CONSOLE, {
            execute: () => this.openExternalTerminal()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: ExternalTerminalCommands.OPEN_NATIVE_CONSOLE.id,
            keybinding: 'ctrlcmd+shift+c',
            when: '!terminalFocus'
        });
    }

    /**
     * Open a native console on the host machine.
     *
     * - If multi-root workspace is open, displays a quick pick to let users choose which workspace to spawn the terminal.
     * - If only one workspace is open, the terminal spawns at the root of the current workspace.
     * - If no workspace is open and there is an active editor, the terminal spawns at the parent folder of that file.
     * - If no workspace is open and there are no active editors, the terminal spawns at user home directory.
     */
    protected async openExternalTerminal(): Promise<void> {
        const configuration = this.externalTerminalPreferences.getExternalTerminalConfiguration();

        if (this.workspaceService.isMultiRootWorkspaceOpened) {
            const chosenWorkspaceRoot = await this.selectCwd();
            if (chosenWorkspaceRoot) {
                await this.externalTerminalService.openTerminal(configuration, chosenWorkspaceRoot);
            }
            return;
        }

        if (this.workspaceService.opened) {
            const workspaceRootUri = this.workspaceService.tryGetRoots()[0].resource;
            await this.externalTerminalService.openTerminal(configuration, workspaceRootUri.toString());
            return;
        }

        const fallbackUri = this.editorManager.activeEditor?.editor.uri.parent ?? await this.envVariablesServer.getHomeDirUri();
        await this.externalTerminalService.openTerminal(configuration, fallbackUri.toString());
    }

    /**
     * Display a quick pick for user to choose a target workspace in opened workspaces.
     */
    protected async selectCwd(): Promise<string | undefined> {
        const roots = this.workspaceService.tryGetRoots();
        const selectedItem = await this.quickPickService.show(roots.map(
            ({ resource }) => ({
                label: this.labelProvider.getName(resource),
                description: this.labelProvider.getLongName(resource),
                value: resource.toString()
            })
        ), { placeholder: nls.localize('theia/external-terminal/cwd', 'Select current working directory for new external terminal') });
        return selectedItem?.value;
    }
}
