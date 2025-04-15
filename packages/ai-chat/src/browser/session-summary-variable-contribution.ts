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
import { AIVariable, AIVariableContext, AIVariableResolutionRequest, AIVariableResolver, ResolvedAIContextVariable } from '@theia/ai-core';
import { AIVariableCompletionContext, FrontendVariableContribution, FrontendVariableService } from '@theia/ai-core/lib/browser';
import { MaybePromise, QuickInputService, QuickPickItem, QuickPickItemOrSeparator, QuickPickSeparator } from '@theia/core';
import { ChatService } from '../common';
import { codiconArray } from '@theia/core/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { TaskContextService } from './task-context-service';

export const SESSION_SUMMARY_VARIABLE: AIVariable = {
    id: 'session-summary',
    description: 'Resolves to a summary of the session with the given ID.',
    name: 'session-summary',
    label: 'Session Summary',
    iconClasses: codiconArray('clippy'),
    isContextVariable: true,
    args: [{ name: 'session-id', description: 'The ID of the session to summarize.' }]
};

@injectable()
export class SessionSumaryVariableContribution implements FrontendVariableContribution, AIVariableResolver {
    @inject(QuickInputService) protected readonly quickInputService: QuickInputService;
    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(TaskContextService) protected readonly taskContextService: TaskContextService;

    registerVariables(service: FrontendVariableService): void {
        service.registerResolver(SESSION_SUMMARY_VARIABLE, this);
        service.registerArgumentPicker(SESSION_SUMMARY_VARIABLE, this.pickSession.bind(this));
        service.registerArgumentCompletionProvider(SESSION_SUMMARY_VARIABLE, this.provideCompletionItems.bind(this));
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
        const context = AIVariableCompletionContext.get(SESSION_SUMMARY_VARIABLE.name, model, position, matchString);
        if (!context) { return undefined; }
        const { userInput, range, prefix } = context;
        return this.getItems().filter(candidate => QuickPickItem.is(candidate) && candidate.label.startsWith(userInput)).map(({ label, id }: QuickPickItem) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Class,
            range,
            insertText: `${prefix}${id}`,
            detail: id,
            filterText: userInput,
        }));
    }

    protected getItems(): QuickPickItemOrSeparator[] {
        const existingSummaries = this.taskContextService.getSummaries();
        return [
            ...(existingSummaries.length ? [{ type: 'separator', label: 'Saved Tasks' }] satisfies QuickPickSeparator[] : []),
            ...existingSummaries satisfies QuickPickItem[],
            ...(existingSummaries.length ? [{ type: 'separator', label: 'Other Sessions' }] satisfies QuickPickSeparator[] : []),
            ...this.chatService.getSessions()
                .filter(candidate => !this.taskContextService.hasSummary(candidate.id) && candidate.model.getRequests().length)
                .map<QuickPickItem>(session => ({ type: 'item', label: session.title || session.id, id: session.id }))
        ];
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.id === SESSION_SUMMARY_VARIABLE.id ? 10000 : -5;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIContextVariable | undefined> {
        if (request.variable.id !== SESSION_SUMMARY_VARIABLE.id || !request.arg) { return; }
        const value = await this.taskContextService.getSummary(request.arg).catch(() => undefined);
        return value ? { ...request, value, contextValue: value } : undefined;
    }
}
