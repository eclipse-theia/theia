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

import { Disposable } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import { AIVariableContext, AIVariableResolutionRequest, AIVariableService, DefaultAIVariableService, PromptText } from '../common';
import * as monaco from '@theia/monaco-editor-core';

export type AIVariableDropHandler = (event: DragEvent, context: AIVariableContext) => Promise<AIVariableDropResult | undefined>;

export interface AIVariableDropResult {
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
}

export interface FrontendVariableContribution {
    registerVariables(service: FrontendVariableService): void;
}

@injectable()
export class DefaultFrontendVariableService extends DefaultAIVariableService implements FrontendApplicationContribution {
    protected dropHandlers = new Set<AIVariableDropHandler>();

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
}
