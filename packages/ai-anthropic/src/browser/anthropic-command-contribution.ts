// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Command, CommandContribution, CommandRegistry, MessageService, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AnthropicLanguageModelsManager } from '../common';

const ANTHROPIC_CATEGORY = 'Anthropic';
const ANTHROPIC_CATEGORY_KEY = nls.localize('theia/ai/anthropic/category', ANTHROPIC_CATEGORY);

export const REFRESH_ANTHROPIC_MODELS_COMMAND = Command.toLocalizedCommand({
    id: 'ai-features.anthropic.refreshModels',
    category: ANTHROPIC_CATEGORY,
    label: 'Refresh Available Models'
}, 'theia/ai/anthropic/refreshModels', ANTHROPIC_CATEGORY_KEY);

@injectable()
export class AnthropicCommandContribution implements CommandContribution {

    @inject(AnthropicLanguageModelsManager)
    protected readonly manager: AnthropicLanguageModelsManager;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(REFRESH_ANTHROPIC_MODELS_COMMAND, {
            execute: () => this.refresh()
        });
    }

    protected async refresh(): Promise<void> {
        try {
            await this.manager.refreshModels();
            this.messageService.info(nls.localize(
                'theia/ai/anthropic/refreshModels/success',
                'Anthropic models refreshed.'
            ));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.messageService.error(nls.localize(
                'theia/ai/anthropic/refreshModels/error',
                'Failed to refresh Anthropic models: {0}',
                message
            ));
        }
    }
}
