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
import { CHAT_CONTEXT_DETAILS_VARIABLE_ID } from './context-variables';

export const CONTEXT_DETAILS_VARIABLE: AIVariable = {
    id: CHAT_CONTEXT_DETAILS_VARIABLE_ID,
    description: nls.localize('theia/ai/core/contextDetailsVariable/description', 'Provides full text values and descriptions for all context elements.'),
    name: CHAT_CONTEXT_DETAILS_VARIABLE_ID,
};

@injectable()
export class ContextDetailsVariableContribution implements AIVariableContribution, AIVariableResolver {
    registerVariables(service: AIVariableService): void {
        service.registerResolver(CONTEXT_DETAILS_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === CONTEXT_DETAILS_VARIABLE.name ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        /** By expecting context.request, we're assuming that this variable will not be resolved until the context has been resolved. */
        if (!ChatSessionContext.is(context) || request.variable.name !== CONTEXT_DETAILS_VARIABLE.name || !context.request) { return undefined; }
        const data = context.request.context.variables.map(variable => ({
            type: variable.variable.name,
            ref: variable.value,
            content: variable.contextValue
        }));
        return {
            variable: CONTEXT_DETAILS_VARIABLE,
            value: dataToJsonCodeBlock(data)
        };
    }
}
