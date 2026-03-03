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

import { inject, injectable } from '@theia/core/shared/inversify';
import { AbstractTextToModelParsingChatAgent, SystemMessageDescription } from '@theia/ai-chat/lib/common/chat-agents';
import { AIVariableContext, LanguageModelRequirement } from '@theia/ai-core';
import {
    MutableChatRequestModel,
    ChatResponseContent,
    CommandChatResponseContentImpl,
    CustomCallback,
    HorizontalLayoutChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
} from '@theia/ai-chat/lib/common/chat-model';
import {
    CommandRegistry,
    MessageService,
    generateUuid,
    nls,
} from '@theia/core';

import { commandTemplate } from './command-prompt-template';

interface ParsedCommand {
    type: 'theia-command' | 'custom-handler' | 'no-command'
    commandId: string;
    arguments?: string[];
    message?: string;
}

@injectable()
export class CommandChatAgent extends AbstractTextToModelParsingChatAgent<ParsedCommand> {
    @inject(CommandRegistry)
    protected commandRegistry: CommandRegistry;
    @inject(MessageService)
    protected messageService: MessageService;

    id: string = 'Command';
    name = 'Command';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'command',
        identifier: 'default/universal',
    }];
    protected defaultLanguageModelPurpose: string = 'command';

    override description = nls.localize('theia/ai/ide/commandAgent/description',
        'This agent is aware of all commands that the user can execute within the Theia IDE, the tool that the user is currently working with. ' +
        'Based on the user request, it can find the right command and then let the user execute it.');
    override prompts = [commandTemplate];
    override agentSpecificVariables = [{
        name: 'command-ids',
        description: nls.localize('theia/ai/ide/commandAgent/vars/commandIds/description', 'The list of available commands in Theia.'),
        usedInPrompt: true
    }];

    protected override async getSystemMessageDescription(context: AIVariableContext): Promise<SystemMessageDescription | undefined> {
        const knownCommands: string[] = [];
        for (const command of this.commandRegistry.getAllCommands()) {
            knownCommands.push(`${command.id}: ${command.label}`);
        }

        const variantInfo = this.promptService.getPromptVariantInfo(commandTemplate.id);

        const systemPrompt = await this.promptService.getResolvedPromptFragment(commandTemplate.id, {
            'command-ids': knownCommands.join('\n')
        }, context);
        if (systemPrompt === undefined) {
            throw new Error('Couldn\'t get prompt ');
        }
        return SystemMessageDescription.fromResolvedPromptFragment(systemPrompt, variantInfo?.variantId, variantInfo?.isCustomized);
    }

    /**
     * @param text the text received from the language model
     * @returns the parsed command if the text contained a valid command.
     * If there was no json in the text, return a no-command response.
     */
    protected async parseTextResponse(text: string): Promise<ParsedCommand> {
        const jsonMatch = text.match(/(\{[\s\S]*\})/);
        const jsonString = jsonMatch ? jsonMatch[1] : `{
    "type": "no-command",
    "message": "Please try again."
}`;
        const parsedCommand = JSON.parse(jsonString) as ParsedCommand;
        return parsedCommand;
    }

    protected createResponseContent(parsedCommand: ParsedCommand, request: MutableChatRequestModel): ChatResponseContent {
        if (parsedCommand.type === 'theia-command') {
            const theiaCommand = this.commandRegistry.getCommand(parsedCommand.commandId);
            if (theiaCommand === undefined) {
                console.error(`No Theia Command with id ${parsedCommand.commandId}`);
                request.cancel();
            }
            const args = parsedCommand.arguments !== undefined &&
                parsedCommand.arguments.length > 0
                ? parsedCommand.arguments
                : undefined;

            return new HorizontalLayoutChatResponseContentImpl([
                new MarkdownChatResponseContentImpl(
                    nls.localize('theia/ai/ide/commandAgent/response/theiaCommand', 'I found this command that might help you:')
                ),
                new CommandChatResponseContentImpl(theiaCommand, undefined, args),
            ]);
        } else if (parsedCommand.type === 'custom-handler') {
            const id = `ai-command-${generateUuid()}`;
            const commandArgs = parsedCommand.arguments !== undefined && parsedCommand.arguments.length > 0 ? parsedCommand.arguments : [];
            const args = [id, ...commandArgs];
            const customCallback: CustomCallback = {
                label: nls.localize('theia/ai/ide/commandAgent/commandCallback/label', 'AI command'),
                callback: () => this.commandCallback(...args),
            };
            return new HorizontalLayoutChatResponseContentImpl([
                new MarkdownChatResponseContentImpl(
                    nls.localize('theia/ai/ide/commandAgent/response/customHandler', 'Try executing this:')
                ),
                new CommandChatResponseContentImpl(undefined, customCallback, args),
            ]);
        } else {
            return new MarkdownChatResponseContentImpl(parsedCommand.message ?? nls.localize('theia/ai/ide/commandAgent/response/noCommand',
                'Sorry, I can\'t find such a command'));
        }
    }

    protected async commandCallback(...commandArgs: unknown[]): Promise<void> {
        this.messageService.info(nls.localize('theia/ai/ide/commandAgent/commandCallback/message',
            'Executing callback with args {0}. The first arg is the command id registered for the dynamically registered command. ' +
            'The other args are the actual args for the handler.', commandArgs.join(', ')), nls.localize('theia/ai/ide/commandAgent/commandCallback/confirmAction', 'Got it'));
    }
}
