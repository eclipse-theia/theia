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

import { MaybePromise, nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { AIVariable, ResolvedAIVariable, AIVariableContribution, AIVariableResolver, AIVariableService, AIVariableResolutionRequest, AIVariableContext } from '@theia/ai-core';
import { dataToJsonCodeBlock } from './chat-string-utils';
import { ChatSessionContext } from './chat-agents';

export const CONTEXT_SUMMARY_VARIABLE: AIVariable = {
    id: 'contextSummary',
    description: nls.localize('theia/ai/core/contextSummaryVariable/description', 'Describes files in the context for a given session.'),
    name: 'contextSummary',
};

@injectable()
export class ContextSummaryVariableContribution implements AIVariableContribution, AIVariableResolver {
    registerVariables(service: AIVariableService): void {
        service.registerResolver(CONTEXT_SUMMARY_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === CONTEXT_SUMMARY_VARIABLE.name ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (!ChatSessionContext.is(context) || request.variable.name !== CONTEXT_SUMMARY_VARIABLE.name) { return undefined; }
        const data = ChatSessionContext.getVariables(context).filter(variable => variable.variable.isContextVariable)
            .map(variable => ({
                type: variable.variable.name,
                // eslint-disable-next-line no-null/no-null
                instanceData: variable.arg || null,
                contextElementId: variable.variable.id + variable.arg
            }));
        return {
            variable: CONTEXT_SUMMARY_VARIABLE,
            value: dataToJsonCodeBlock(data)
        };
    }
}
