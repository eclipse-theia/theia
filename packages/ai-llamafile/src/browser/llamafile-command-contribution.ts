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
import { LanguageModelRegistry } from '@theia/ai-core';
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser/ai-command-handler-factory';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { PreferenceService, QuickInputService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LlamafileLanguageModel } from '../common/llamafile-language-model';
import { LlamafileEntry, PREFERENCE_LLAMAFILE } from './llamafile-preferences';

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

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

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
                    const model = await this.getLanguageModelForItem(result.label);
                    if (model === undefined) {
                        this.messageService.error('No fitting Llamafile model found.');
                        return;
                    }
                    model.startServer();
                } catch (error) {
                    console.error('Something went wrong during the llamafile start.', error);
                }
            }
        }));
        commandRegistry.registerCommand(StopLlamafileCommand, this.commandHandlerFactory({
            execute: async () => {
                try {
                    const llamaFiles = await this.getStartedLlamafiles();
                    if (llamaFiles === undefined || llamaFiles.length === 0) {
                        this.messageService.error('No Llamafiles running.');
                        return;
                    }
                    const options = llamaFiles.map(llamaFile => ({ label: llamaFile.name }));
                    const result = await this.quickInputService.showQuickPick(options);
                    if (result === undefined) {
                        return;
                    }
                    const model = llamaFiles.find(llamaFile => llamaFile.name === result.label);
                    if (model === undefined) {
                        this.messageService.error('No fitting Llamafile model found.');
                        return;
                    }
                    model.killServer();
                } catch (error) {
                    console.error('Something went wrong during the llamafile stop.', error);
                }
            }
        }));
    }

    private async getLanguageModelForItem(name: string): Promise<LlamafileLanguageModel | undefined> {
        const result = await this.languageModelRegistry.getLanguageModel(name);
        if (result instanceof LlamafileLanguageModel) {
            return result;
        } else {
            return undefined;
        }
    }
    private async getStartedLlamafiles(): Promise<LlamafileLanguageModel[]> {
        const models = await this.languageModelRegistry.getLanguageModels();
        return models.filter(model => model instanceof LlamafileLanguageModel && model.isStarted) as LlamafileLanguageModel[];
    }
}
