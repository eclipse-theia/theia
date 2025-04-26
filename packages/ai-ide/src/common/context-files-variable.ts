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
import { ChatSessionContext } from '@theia/ai-chat';
import { CONTEXT_FILES_VARIABLE_ID } from './context-variables';

export const CONTEXT_FILES_VARIABLE: AIVariable = {
    id: CONTEXT_FILES_VARIABLE_ID,
    description: nls.localize('theia/ai/core/contextSummaryVariable/description', 'Describes files in the context for a given session.'),
    name: CONTEXT_FILES_VARIABLE_ID,
};

@injectable()
export class ContextFilesVariableContribution implements AIVariableContribution, AIVariableResolver {
    registerVariables(service: AIVariableService): void {
        service.registerResolver(CONTEXT_FILES_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === CONTEXT_FILES_VARIABLE.name ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (!ChatSessionContext.is(context) || request.variable.name !== CONTEXT_FILES_VARIABLE.name) { return undefined; }
        const variables = ChatSessionContext.getVariables(context);

        return {
            variable: CONTEXT_FILES_VARIABLE,
            value: variables.filter(variable => variable.variable.name === 'file' && !!variable.arg)
                .map(variable => `- ${variable.arg}`).join('\n')
        };
    }
}
