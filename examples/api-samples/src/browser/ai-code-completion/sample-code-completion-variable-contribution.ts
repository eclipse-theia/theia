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

import { CodeCompletionVariableContext } from '@theia/ai-code-completion/lib/browser/code-completion-variable-context';
import { AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver, ResolvedAIVariable } from '@theia/ai-core';
import { FrontendVariableContribution, FrontendVariableService } from '@theia/ai-core/lib/browser';
import { MaybePromise } from '@theia/core';
import { injectable, interfaces } from '@theia/core/shared/inversify';

const SAMPLE_VARIABLE: AIVariable = {
    id: 'sampleCodeCompletionVariable',
    name: 'sampleCodeCompletionVariable',
    description: 'A sample variable for code completion.',
};

/**
 * This variable is used to demonstrate how to create a custom variable for code completion.
 * It is registered as a variable that can be resolved in the context of code completion.
 */
@injectable()
export class SampleCodeCompletionVariableContribution implements FrontendVariableContribution, AIVariableResolver {

    registerVariables(service: FrontendVariableService): void {
        service.registerResolver(SAMPLE_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return CodeCompletionVariableContext.is(context) && request.variable.id === SAMPLE_VARIABLE.id ? 1 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.id === SAMPLE_VARIABLE.id && CodeCompletionVariableContext.is(context) && context.model.uri.path.endsWith('.sample.js')) {
            return Promise.resolve({
                variable: SAMPLE_VARIABLE,
                value: 'This is a special sample file, every line must end with a "// sample" comment.'
            });
        }
    }

}

export const bindSampleCodeCompletionVariableContribution = (bind: interfaces.Bind) => {
    bind(AIVariableContribution).to(SampleCodeCompletionVariableContribution).inSingletonScope();
};
