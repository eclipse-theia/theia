// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser/ai-command-handler-factory';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { PreferenceService, QuickInputService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LlamafileEntry, LlamafileManager } from '../common/llamafile-manager';
import { PREFERENCE_LLAMAFILE } from './llamafile-preferences';

export const StartLlamafileCommand = {
    id: 'llamafile.start',
    label: 'Start Llamafile',
};
export const StopLlamafileCommand = {
    id: 'llamafile.stop',
    label: 'Stop Llamafile',
};

@injectable()
export class LlamafileCommandContribution implements CommandContribution {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(MessageService)
    protected messageService: MessageService;

    @inject(LlamafileManager)
    protected llamafileManager: LlamafileManager;

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(StartLlamafileCommand, this.commandHandlerFactory({
            execute: async () => {
                try {
                    const llamaFiles = this.preferenceService.get<LlamafileEntry[]>(PREFERENCE_LLAMAFILE);
                    if (llamaFiles === undefined || llamaFiles.length === 0) {
                        this.messageService.error('No Llamafiles configured.');
                        return;
                    }
                    const options = llamaFiles.map(llamaFile => ({ label: llamaFile.name }));
                    const result = await this.quickInputService.showQuickPick(options);
                    if (result === undefined) {
                        return;
                    }
                    this.llamafileManager.startServer(result.label);
                } catch (error) {
                    console.error('Something went wrong during the llamafile start.', error);
                    this.messageService.error(`Something went wrong during the llamafile start: ${error.message}.\nFor more information, see the console.`);
                }
            }
        }));
        commandRegistry.registerCommand(StopLlamafileCommand, this.commandHandlerFactory({
            execute: async () => {
                try {
                    const llamaFiles = await this.llamafileManager.getStartedLlamafiles();
                    if (llamaFiles === undefined || llamaFiles.length === 0) {
                        this.messageService.error('No Llamafiles running.');
                        return;
                    }
                    const options = llamaFiles.map(llamaFile => ({ label: llamaFile }));
                    const result = await this.quickInputService.showQuickPick(options);
                    if (result === undefined) {
                        return;
                    }
                    this.llamafileManager.stopServer(result.label);
                } catch (error) {
                    console.error('Something went wrong during the llamafile stop.', error);
                    this.messageService.error(`Something went wrong during the llamafile stop: ${error.message}.\nFor more information, see the console.`);
                }
            }
        }));
    }
}
