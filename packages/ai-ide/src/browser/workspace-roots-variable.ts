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
import { injectable, inject } from '@theia/core/shared/inversify';
import {
    AIVariable,
    ResolvedAIVariable,
    AIVariableContribution,
    AIVariableResolver,
    AIVariableService,
    AIVariableResolutionRequest,
    AIVariableContext
} from '@theia/ai-core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { WORKSPACE_ROOTS_VARIABLE_ID } from '../common/context-variables';
import { WorkspaceFunctionScope } from './workspace-functions';

export const WORKSPACE_ROOTS_VARIABLE: AIVariable = {
    id: WORKSPACE_ROOTS_VARIABLE_ID,
    description: nls.localize('theia/ai/ide/workspaceRootsVariable/description', 'Lists all workspace root directories and explains the path convention.'),
    name: WORKSPACE_ROOTS_VARIABLE_ID,
};

@injectable()
export class WorkspaceRootsVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(WORKSPACE_ROOTS_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === WORKSPACE_ROOTS_VARIABLE.name ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== WORKSPACE_ROOTS_VARIABLE.name) {
            return undefined;
        }

        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return {
                variable: WORKSPACE_ROOTS_VARIABLE,
                value: ''
            };
        }

        // Names must match resolveRelativePath() expectations.
        const rootMapping = this.workspaceScope.getRootMapping();
        const rootNames = Array.from(rootMapping.keys());

        const hasCollisions = roots.length > rootMapping.size;

        if (rootNames.length === 1) {
            return {
                variable: WORKSPACE_ROOTS_VARIABLE,
                value: `## Workspace
This is a single-root workspace. The root directory is \`${rootNames[0]}\`.
All file paths use the format \`${rootNames[0]}/<relativePath>\`.`
            };
        }

        const rootList = rootNames.map(name => `- \`${name}\``).join('\n');
        const collisionWarning = hasCollisions
            ? '\n\n**Note:** Some workspace roots share the same directory name. ' +
            'Not all roots may be directly addressable by name. ' +
            'If a file path is ambiguous, you will receive an error with guidance on how to disambiguate.'
            : '';
        return {
            variable: WORKSPACE_ROOTS_VARIABLE,
            value: `## Workspace Roots
This is a multi-root workspace containing the following root directories:
${rootList}

All file paths use the format \`<rootName>/<relativePath>\` \
where \`<rootName>\` is one of the roots listed above. \
Always prefix paths with the appropriate root name.${collisionWarning}`
        };
    }
}
