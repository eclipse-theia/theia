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

import { Disposable, MessageService, Prioritizeable } from '@theia/core';
import { FrontendApplicationContribution, OpenerService, open } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AIVariable,
    AIVariableArg,
    AIVariableContext,
    AIVariableOpener,
    AIVariableResolutionRequest,
    AIVariableResourceResolver,
    AIVariableService,
    DefaultAIVariableService,
    PromptText
} from '../common';
import * as monaco from '@theia/monaco-editor-core';

export type AIVariableDropHandler = (event: DragEvent, context: AIVariableContext) => Promise<AIVariableDropResult | undefined>;

export interface AIVariableDropResult {
    variables: AIVariableResolutionRequest[],
    text?: string
};

export type AIVariablePasteHandler = (event: ClipboardEvent, context: AIVariableContext) => Promise<AIVariablePasteResult | undefined>;

export interface AIVariablePasteResult {
    variables: AIVariableResolutionRequest[],
    text?: string
};

export interface AIVariableCompletionContext {
    /** Portion of user input to be used for filtering completion candidates. */
    userInput: string;
    /** The range of suggestion completions. */
    range: monaco.Range
    /** A prefix to be applied to each completion item's text */
    prefix: string
}

export namespace AIVariableCompletionContext {
    export function get(
        variableName: string,
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        matchString?: string
    ): AIVariableCompletionContext | undefined {
        const lineContent = model.getLineContent(position.lineNumber);
        const indexOfVariableTrigger = lineContent.lastIndexOf(matchString ?? PromptText.VARIABLE_CHAR, position.column - 1);

        // check if there is a variable trigger and no space typed between the variable trigger and the cursor
        if (indexOfVariableTrigger === -1 || lineContent.substring(indexOfVariableTrigger).includes(' ')) {
            return undefined;
        }

        // determine whether we are providing completions before or after the variable argument separator
        const indexOfVariableArgSeparator = lineContent.lastIndexOf(PromptText.VARIABLE_SEPARATOR_CHAR, position.column - 1);
        const triggerCharIndex = Math.max(indexOfVariableTrigger, indexOfVariableArgSeparator);

        const userInput = lineContent.substring(triggerCharIndex + 1, position.column - 1);
        const range = new monaco.Range(position.lineNumber, triggerCharIndex + 2, position.lineNumber, position.column);
        const matchVariableChar = lineContent[triggerCharIndex] === (matchString ? matchString : PromptText.VARIABLE_CHAR);
        const prefix = matchVariableChar ? variableName + PromptText.VARIABLE_SEPARATOR_CHAR : '';
        return { range, userInput, prefix };
    }
}

export const FrontendVariableService = Symbol('FrontendVariableService');
export interface FrontendVariableService extends AIVariableService {
    registerDropHandler(handler: AIVariableDropHandler): Disposable;
    unregisterDropHandler(handler: AIVariableDropHandler): void;
    getDropResult(event: DragEvent, context: AIVariableContext): Promise<AIVariableDropResult>;

    registerPasteHandler(handler: AIVariablePasteHandler): Disposable;
    unregisterPasteHandler(handler: AIVariablePasteHandler): void;
    getPasteResult(event: ClipboardEvent, context: AIVariableContext): Promise<AIVariablePasteResult>;

    registerOpener(variable: AIVariable, opener: AIVariableOpener): Disposable;
    unregisterOpener(variable: AIVariable, opener: AIVariableOpener): void;
    getOpener(name: string, arg: string | undefined, context: AIVariableContext): Promise<AIVariableOpener | undefined>;
    open(variable: AIVariableArg, context?: AIVariableContext): Promise<void>
}

export interface FrontendVariableContribution {
    registerVariables(service: FrontendVariableService): void;
}

@injectable()
export class DefaultFrontendVariableService extends DefaultAIVariableService implements FrontendApplicationContribution, FrontendVariableService {
    protected dropHandlers = new Set<AIVariableDropHandler>();
    protected pasteHandlers = new Set<AIVariablePasteHandler>();

    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(AIVariableResourceResolver) protected readonly aiResourceResolver: AIVariableResourceResolver;
    @inject(OpenerService) protected readonly openerService: OpenerService;

    onStart(): void {
        this.initContributions();
    }

    registerDropHandler(handler: AIVariableDropHandler): Disposable {
        this.dropHandlers.add(handler);
        return Disposable.create(() => this.unregisterDropHandler(handler));
    }

    unregisterDropHandler(handler: AIVariableDropHandler): void {
        this.dropHandlers.delete(handler);
    }

    async getDropResult(event: DragEvent, context: AIVariableContext): Promise<AIVariableDropResult> {
        let text: string | undefined = undefined;
        const variables: AIVariableResolutionRequest[] = [];
        for (const handler of this.dropHandlers) {
            const result = await handler(event, context);
            if (result) {
                variables.push(...result.variables);
                if (text === undefined) {
                    text = result.text;
                }
            }
        }
        return { variables, text };
    }

    registerPasteHandler(handler: AIVariablePasteHandler): Disposable {
        this.pasteHandlers.add(handler);
        return Disposable.create(() => this.unregisterPasteHandler(handler));
    }

    unregisterPasteHandler(handler: AIVariablePasteHandler): void {
        this.pasteHandlers.delete(handler);
    }

    async getPasteResult(event: ClipboardEvent, context: AIVariableContext): Promise<AIVariablePasteResult> {
        let text: string | undefined = undefined;
        const variables: AIVariableResolutionRequest[] = [];
        for (const handler of this.pasteHandlers) {
            const result = await handler(event, context);
            if (result) {
                variables.push(...result.variables);
                if (text === undefined) {
                    text = result.text;
                }
            }
        }
        return { variables, text };
    }

    registerOpener(variable: AIVariable, opener: AIVariableOpener): Disposable {
        const key = this.getKey(variable.name);
        if (!this.variables.get(key)) {
            this.variables.set(key, variable);
            this.onDidChangeVariablesEmitter.fire();
        }
        const openers = this.openers.get(key) ?? [];
        openers.push(opener);
        this.openers.set(key, openers);
        return Disposable.create(() => this.unregisterOpener(variable, opener));
    }

    unregisterOpener(variable: AIVariable, opener: AIVariableOpener): void {
        const key = this.getKey(variable.name);
        const registeredOpeners = this.openers.get(key);
        registeredOpeners?.splice(registeredOpeners.indexOf(opener), 1);
    }

    async getOpener(name: string, arg: string | undefined, context: AIVariableContext = {}): Promise<AIVariableOpener | undefined> {
        const variable = this.getVariable(name);
        return variable && Prioritizeable.prioritizeAll(
            this.openers.get(this.getKey(name)) ?? [],
            opener => (async () => opener.canOpen({ variable, arg }, context))().catch(() => 0)
        )
            .then(prioritized => prioritized.at(0)?.value);
    }

    async open(request: AIVariableArg, context?: AIVariableContext | undefined): Promise<void> {
        const { variableName, arg } = this.parseRequest(request);
        const variable = this.getVariable(variableName);
        if (!variable) {
            this.messageService.warn('No variable found for open request.');
            return;
        }
        const opener = await this.getOpener(variableName, arg, context);
        try {
            return opener ? opener.open({ variable, arg }, context ?? {}) : this.openReadonly({ variable, arg }, context);
        } catch (err) {
            console.error('Unable to open variable:', err);
            this.messageService.error('Unable to display variable value.');
        }
    }

    protected async openReadonly(request: AIVariableResolutionRequest, context: AIVariableContext = {}): Promise<void> {
        const resolved = await this.resolveVariable(request, context);
        if (resolved === undefined) {
            this.messageService.warn('Unable to resolve variable.');
            return;
        }
        const resource = this.aiResourceResolver.getOrCreate(request, context, resolved.value);
        await open(this.openerService, resource.uri);
        resource.dispose();
    }
}
