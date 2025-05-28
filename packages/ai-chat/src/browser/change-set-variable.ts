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
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIVariable, ResolvedAIVariable, AIVariableContribution, AIVariableResolver, AIVariableService, AIVariableResolutionRequest, AIVariableContext } from '@theia/ai-core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CHANGE_SET_SUMMARY_VARIABLE_ID, ChatSessionContext } from '../common';

export const CHANGE_SET_SUMMARY_VARIABLE: AIVariable = {
    id: CHANGE_SET_SUMMARY_VARIABLE_ID,
    description: nls.localize('theia/ai/core/changeSetSummaryVariable/description', 'Provides a summary of the files in a change set and their contents.'),

    name: CHANGE_SET_SUMMARY_VARIABLE_ID,
};

@injectable()
export class ChangeSetVariableContribution implements AIVariableContribution, AIVariableResolver {
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(CHANGE_SET_SUMMARY_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === CHANGE_SET_SUMMARY_VARIABLE.name ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (!ChatSessionContext.is(context) || request.variable.name !== CHANGE_SET_SUMMARY_VARIABLE.name) { return undefined; }
        if (!context.model.changeSet.getElements().length) {
            return {
                variable: CHANGE_SET_SUMMARY_VARIABLE,
                value: ''
            };
        }
        const entries = await Promise.all(
            context.model.changeSet.getElements().map(async element => `- file: ${await this.workspaceService.getWorkspaceRelativePath(element.uri)}, status: ${element.state}`)
        );
        return {
            variable: CHANGE_SET_SUMMARY_VARIABLE,
            value: `## Previously Proposed Changes
You have previously proposed changes for the following files. Some suggestions may have been accepted by the user, while others may still be pending.
${entries.join('\n')}
`
        };
    }
}
