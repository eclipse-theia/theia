// *****************************************************************************
// Copyright (C) 2025 Lonti.com Pty Ltd.
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

import { AIVariableContext, AIVariableResolutionRequest, AIVariableResolver, ResolvedAIVariable } from '@theia/ai-core';
import { FrontendVariableContribution, FrontendVariableService } from '@theia/ai-core/lib/browser';
import { MaybePromise } from '@theia/core';
import { PreferenceService } from '@theia/core/lib/browser/preferences/preference-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PREF_AI_INLINE_COMPLETION_MAX_CONTEXT_LINES } from './ai-code-completion-preference';
import { CodeCompletionVariableContext } from './code-completion-variable-context';
import { FILE, LANGUAGE, PREFIX, SUFFIX } from './code-completion-variables';

@injectable()
export class CodeCompletionVariableContribution implements FrontendVariableContribution, AIVariableResolver {
    @inject(PreferenceService)
    protected preferences: PreferenceService;

    registerVariables(service: FrontendVariableService): void {
        [
            FILE,
            PREFIX,
            SUFFIX,
            LANGUAGE
        ].forEach(variable => {
            service.registerResolver(variable, this);
        });
    }

    canResolve(_request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return CodeCompletionVariableContext.is(context) ? 1 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (!CodeCompletionVariableContext.is(context)) {
            return Promise.resolve(undefined);
        }

        switch (request.variable.id) {
            case FILE.id:
                return this.resolveFile(context);
            case LANGUAGE.id:
                return this.resolveLanguage(context);
            case PREFIX.id:
                return this.resolvePrefix(context);
            case SUFFIX.id:
                return this.resolveSuffix(context);
            default:
                return undefined;
        }
    }

    protected resolvePrefix(context: CodeCompletionVariableContext): ResolvedAIVariable | undefined {
        const position = context.position;
        const model = context.model;
        const maxContextLines = this.preferences.get<number>(PREF_AI_INLINE_COMPLETION_MAX_CONTEXT_LINES, -1);
        let prefixStartLine = 1;

        if (maxContextLines === 0) {
            // Only the cursor line
            prefixStartLine = position.lineNumber;
        } else if (maxContextLines > 0) {
            const linesBeforeCursor = position.lineNumber - 1;

            // Allocate one more line to the prefix in case of an odd maxContextLines
            const prefixLines = Math.min(
                Math.ceil(maxContextLines / 2),
                linesBeforeCursor
            );

            prefixStartLine = Math.max(1, position.lineNumber - prefixLines);
        }

        const prefix = model.getValueInRange({
            startLineNumber: prefixStartLine,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
        });

        return {
            variable: PREFIX,
            value: prefix
        };
    }

    protected resolveSuffix(context: CodeCompletionVariableContext): ResolvedAIVariable | undefined {
        const position = context.position;
        const model = context.model;
        const maxContextLines = this.preferences.get<number>(PREF_AI_INLINE_COMPLETION_MAX_CONTEXT_LINES, -1);
        let suffixEndLine = model.getLineCount();

        if (maxContextLines === 0) {
            suffixEndLine = position.lineNumber;
        } else if (maxContextLines > 0) {
            const linesAfterCursor = model.getLineCount() - position.lineNumber;

            const suffixLines = Math.min(
                Math.floor(maxContextLines / 2),
                linesAfterCursor
            );

            suffixEndLine = Math.min(model.getLineCount(), position.lineNumber + suffixLines);
        }

        const suffix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: suffixEndLine,
            endColumn: model.getLineMaxColumn(suffixEndLine),
        });

        return {
            variable: SUFFIX,
            value: suffix
        };
    }

    protected resolveLanguage(context: CodeCompletionVariableContext): ResolvedAIVariable | undefined {
        return {
            variable: LANGUAGE,
            value: context.model.getLanguageId()
        };
    }

    protected resolveFile(context: CodeCompletionVariableContext): ResolvedAIVariable | undefined {
        return {
            variable: FILE,
            value: context.model.uri.toString(false)
        };
    }

}
