// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver, AIVariableService, ResolvedAIVariable } from '@theia/ai-core';
import { MaybePromise, nls, QuickInputService, QuickPickItem, QuickPickItemOrSeparator } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';

const TERMINAL_COMMAND_BLOCK: AIVariable = {
    id: 'ai-terminal:terminal-command-block',
    description: nls.localize('theia/ai/terminal/terminalCommandBlockAIVariable/description', 'Stores an executed terminal command and its corresponding output.'),
    name: 'terminalCommand',
    args: [{
        name: 'index',
        description: nls.localize('theia/ai/terminal/terminalCommandBlockAIVariable/index/description',
            'Index of the command block in the terminal history. Defaults to the last command if not specified.'
        )
    }]
};

interface CommandBlockQuickPickItem extends QuickPickItem {
    blockIndex: number;
}

namespace CommandBlockQuickPickItem {
    export function is(item: QuickPickItemOrSeparator): item is CommandBlockQuickPickItem {
        return 'blockIndex' in item;
    }
}

@injectable()
export class AiTerminalCommandBlockVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(TERMINAL_COMMAND_BLOCK, this);
        service.registerArgumentPicker(TERMINAL_COMMAND_BLOCK, () => this.pickCommandBlock());
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === TERMINAL_COMMAND_BLOCK.name ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        const terminal = this.terminalService.lastUsedTerminal;
        if (!terminal) {
            return undefined;
        }
        if (!terminal.commandHistoryState) {
            return {
                variable: TERMINAL_COMMAND_BLOCK,
                value: terminal.buffer.getLines(Math.max(terminal.buffer.length - 50, 0), 50).join('\n'),
            };
        }
        const commandHistory = terminal.commandHistoryState.commandHistory;
        const commandIndex = request.arg !== undefined ? parseInt(request.arg) : commandHistory.length - 1;
        const block = commandHistory[commandIndex];
        if (!block) {
            return undefined;
        }
        return {
            variable: TERMINAL_COMMAND_BLOCK,
            value: `${block.command}\n${block.output}`
        };
    }

    protected async pickCommandBlock(): Promise<string | undefined> {
        if (!this.terminalService.lastUsedTerminal?.commandHistoryState) {
            return undefined;
        }
        const commandHistory = this.terminalService.lastUsedTerminal.commandHistoryState.commandHistory;
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.items = commandHistory.map((block, i) => (
            {
                label: block.command,
                description: block.output.slice(0, 60),
                blockIndex: i
            } as CommandBlockQuickPickItem
        )).toReversed();
        quickPick.show();
        return new Promise(resolve => {
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (CommandBlockQuickPickItem.is(selected)) {
                    resolve(String(selected.blockIndex));
                    quickPick.dispose();
                }
            });
            quickPick.onDidHide(() => {
                resolve(undefined);
            });
        });
    }
}
