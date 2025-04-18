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

import { MaybePromise, nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import {
    AIVariable,
    ResolvedAIVariable,
    AIVariableContribution,
    AIVariableService,
    AIVariableResolutionRequest,
    AIVariableContext,
    AIVariableResolverWithVariableDependencies,
    AIVariableArg
} from '@theia/ai-core';
import { ChatSessionContext } from '@theia/ai-chat';
import { CONTEXT_SESSION_MEMORY_VARIABLE_ID } from '../common/context-variables';
import { SESSION_SUMMARY_VARIABLE } from '@theia/ai-chat/lib/browser/session-summary-variable-contribution';

export const CONTEXT_SESSION_MEMORY_VARIABLE: AIVariable = {
    id: CONTEXT_SESSION_MEMORY_VARIABLE_ID,
    description: nls.localize('theia/ai/core/contextSummaryVariable/description', 'Resolves any summaries present in the context.'),
    name: CONTEXT_SESSION_MEMORY_VARIABLE_ID,
};

@injectable()
export class ContextSessionSummaryVariable implements AIVariableContribution, AIVariableResolverWithVariableDependencies {
    registerVariables(service: AIVariableService): void {
        service.registerResolver(CONTEXT_SESSION_MEMORY_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === CONTEXT_SESSION_MEMORY_VARIABLE.name ? 50 : 0;
    }

    async resolve(
        request: AIVariableResolutionRequest,
        context: AIVariableContext,
        resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<ResolvedAIVariable | undefined> {
        if (!resolveDependency || !ChatSessionContext.is(context) || request.variable.name !== CONTEXT_SESSION_MEMORY_VARIABLE.name) { return undefined; }
        const allSummaryRequests = context.model.context.getVariables().filter(candidate => candidate.variable.id === SESSION_SUMMARY_VARIABLE.id);
        const allSummaries = await Promise.all(allSummaryRequests.map(summaryRequest => resolveDependency(summaryRequest).then(resolved => resolved?.value)));
        const value = allSummaries.map((content, index) => `# Context Memory ${index + 1}\n\n${content}`).join('\n\n');
        return {
            ...request,
            value
        };
    }
}
