// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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

import { BasePromptFragment, PromptService } from '@theia/ai-core';
import { ILogger, nls } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import {
    AbstractChatAgent, ChatAgent, ChatSessionCompaction, ChatSessionCompactionService, CompactionChatResponseContentImpl, ErrorChatResponseContentImpl,
    MarkdownChatResponseContentImpl, MutableChatRequestModel, ParsedChatRequestAgentPart, ParsedChatRequestTextPart, ParsedChatRequestVariablePart,
    SESSION_COMPACTION_PROVIDER
} from '../common';
import { PROMPT_VARIABLE } from '@theia/ai-core/lib/browser/prompt-variable-contribution';
import { ChatSessionSummarizer } from './chat-session-summarizer';

export const COMPACT_COMMAND_NAME = 'compact';
export const COMPACT_COMMAND_FRAGMENT_ID = 'chat-session-compact-command';

@injectable()
export class ChatSessionCompactionServiceImpl implements ChatSessionCompactionService {

    @inject(ChatSessionSummarizer) protected readonly summarizer: ChatSessionSummarizer;
    @inject(PromptService) protected readonly promptService: PromptService;
    @inject(ILogger) @named('ai-chat:ChatSessionCompactionServiceImpl') protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        // The fragment makes the command known to the request parser and the completion in the chat input. The chat
        // service does not send the template to a model. Only a mention inside other text resolves to it.
        this.promptService.addBuiltInPromptFragment({
            id: COMPACT_COMMAND_FRAGMENT_ID,
            template: `/${COMPACT_COMMAND_NAME}`,
            isCommand: true,
            commandName: COMPACT_COMMAND_NAME,
            commandDescription: nls.localize('theia/ai/chat/compactCommand/description', 'Summarize the conversation to reduce token usage, and stay in this session'),
            commandArgumentHint: nls.localize('theia/ai/chat/compactCommand/argumentHint', '[focus instructions]')
        });
    }

    isCompactionCommand(request: MutableChatRequestModel, agent: ChatAgent): boolean {
        // Other agents, such as Claude Code and Codex, keep their own history.
        return agent instanceof AbstractChatAgent
            && this.getCommandArgument(request) !== undefined
            // Another command with this name for the agent takes precedence, for example a custom command of the user.
            && this.promptService.getCommands(agent.id)
                .every(command => (command as BasePromptFragment).commandName !== COMPACT_COMMAND_NAME || command.id === COMPACT_COMMAND_FRAGMENT_ID);
    }

    /** @returns the text after the command, or `undefined` if the request is not only the command. */
    protected getCommandArgument(request: MutableChatRequestModel): string | undefined {
        const parts = request.message.parts.filter(part =>
            !(part instanceof ParsedChatRequestAgentPart) && !(part instanceof ParsedChatRequestTextPart && part.text.trim().length === 0));
        const command = parts.length === 1 ? parts[0] : undefined;
        if (!(command instanceof ParsedChatRequestVariablePart) || command.variableName !== PROMPT_VARIABLE.name) {
            return undefined;
        }
        const [name, ...args] = (command.variableArg ?? '').split('|');
        return name === COMPACT_COMMAND_NAME ? args.join('|') : undefined;
    }

    async compact(request: MutableChatRequestModel): Promise<void> {
        const instructions = this.getCommandArgument(request);
        const response = request.response;
        request.markAsCompactionRequest();
        const session = request.session;
        if (ChatSessionCompaction.getPromptRequests(session).every(candidate => candidate.isCompactionRequest)) {
            response.response.addContent(new MarkdownChatResponseContentImpl(
                nls.localize('theia/ai/chat/compactCommand/nothingToCompact', 'There is nothing to compact yet.')));
            response.complete();
            return;
        }
        try {
            const { summary, tokenUsage } = await this.summarizer.summarize(session, {
                requests: session.getRequests().filter(candidate => candidate !== request),
                instructions,
                cancellationToken: response.cancellationToken
            });
            if (response.isCanceled) {
                return;
            }
            if (summary.trim().length === 0) {
                throw new Error(nls.localize('theia/ai/chat/compactCommand/emptySummary', 'The language model returned an empty summary.'));
            }
            response.response.addContent(new CompactionChatResponseContentImpl(SESSION_COMPACTION_PROVIDER, undefined, summary));
            if (tokenUsage) {
                response.setTokenUsage(tokenUsage);
            }
            response.complete();
        } catch (error) {
            if (response.isCanceled) {
                return;
            }
            this.logger.warn('Unable to compact the chat session.', error);
            const cause = error instanceof Error ? error : new Error(String(error));
            response.response.addContent(new ErrorChatResponseContentImpl(cause));
            response.error(cause);
        }
    }
}
