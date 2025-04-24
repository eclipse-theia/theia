// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatAgentLocation, ChatService } from '@theia/ai-chat/lib/common';
import { CommandContribution, CommandRegistry, CommandService } from '@theia/core';
import { injectable, inject } from '@theia/core/shared/inversify';
import { AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER } from '../common/summarize-session-commands';
import { TaskContextService } from '@theia/ai-chat/lib/browser/task-context-service';
import { CoderAgent } from './coder-agent';
import { TASK_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/browser/task-context-variable';
import { ARCHITECT_TASK_SUMMARY_PROMPT_TEMPLATE_ID } from '../common/architect-prompt-template';

@injectable()
export class SummarizeSessionCommandContribution implements CommandContribution {
    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(TaskContextService)
    protected readonly taskContextService: TaskContextService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(CoderAgent)
    protected readonly coderAgent: CoderAgent;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER, {
            execute: async () => {
                const activeSession = this.chatService.getActiveSession();

                if (!activeSession) {
                    return;
                }

                const summaryId = await this.taskContextService.summarize(activeSession, ARCHITECT_TASK_SUMMARY_PROMPT_TEMPLATE_ID);

                const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, this.coderAgent);
                const summaryVariable = { variable: TASK_CONTEXT_VARIABLE, arg: summaryId };
                newSession.model.context.addVariables(summaryVariable);
            }
        });
    }
}
