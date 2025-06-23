// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
import { AIVariableContext, AIVariableOpener, AIVariableResolutionRequest, AIVariableResolver, ResolvedAIContextVariable } from '@theia/ai-core';
import { AIVariableCompletionContext, FrontendVariableContribution, FrontendVariableService } from '@theia/ai-core/lib/browser';
import { MaybePromise, QuickInputService, QuickPickItem } from '@theia/core';
import { ChatService } from '../common';
import * as monaco from '@theia/monaco-editor-core';
import { TaskContextService } from './task-context-service';
import { TASK_CONTEXT_VARIABLE } from './task-context-variable';
import { VARIABLE_ADD_CONTEXT_COMMAND } from './ai-chat-frontend-contribution';

@injectable()
export class TaskContextVariableContribution implements FrontendVariableContribution, AIVariableResolver, AIVariableOpener {
    @inject(QuickInputService) protected readonly quickInputService: QuickInputService;
    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(TaskContextService) protected readonly taskContextService: TaskContextService;

    registerVariables(service: FrontendVariableService): void {
        service.registerResolver(TASK_CONTEXT_VARIABLE, this);
        service.registerArgumentPicker(TASK_CONTEXT_VARIABLE, this.pickSession.bind(this));
        service.registerArgumentCompletionProvider(TASK_CONTEXT_VARIABLE, this.provideCompletionItems.bind(this));
        service.registerOpener(TASK_CONTEXT_VARIABLE, this);
    }

    protected async pickSession(): Promise<string | undefined> {
        const items = this.getItems();
        const selection = await this.quickInputService.showQuickPick(items);
        return selection?.id;
    }

    protected async provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        matchString?: string
    ): Promise<monaco.languages.CompletionItem[] | undefined> {
        const context = AIVariableCompletionContext.get(TASK_CONTEXT_VARIABLE.name, model, position, matchString);
        if (!context) { return undefined; }
        const { userInput, range, prefix } = context;
        return this.getItems().filter(candidate => QuickPickItem.is(candidate) && candidate.label.startsWith(userInput)).map(({ label, id }: QuickPickItem) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Class,
            range,
            insertText: `${prefix}${id}`,
            detail: id,
            filterText: userInput,
            command: {
                title: VARIABLE_ADD_CONTEXT_COMMAND.label!,
                id: VARIABLE_ADD_CONTEXT_COMMAND.id,
                arguments: [TASK_CONTEXT_VARIABLE.name, id]
            }
        }));
    }

    protected getItems(): QuickPickItem[] {
        const currentSession = this.chatService.getSessions().find(candidate => candidate.isActive);
        const existingSummaries = this.taskContextService.getAll().filter(candidate => !currentSession || currentSession.id !== candidate.sessionId);
        return existingSummaries;
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.id === TASK_CONTEXT_VARIABLE.id ? 10000 : -5;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedAIContextVariable | undefined> {
        if (request.variable.id !== TASK_CONTEXT_VARIABLE.id || !request.arg) { return; }
        const value = await this.taskContextService.getSummary(request.arg).catch(() => undefined);
        return value ? { ...request, value, contextValue: value } : undefined;
    }

    canOpen(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return this.canResolve(request, context);
    }

    async open(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<void> {
        if (request.variable.id !== TASK_CONTEXT_VARIABLE.id || !request.arg) { throw new Error('Unable to service open request.'); }
        return this.taskContextService.open(request.arg);
    }
}
