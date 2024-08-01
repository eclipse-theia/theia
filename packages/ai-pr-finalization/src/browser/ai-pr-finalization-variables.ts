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
import { CommandService, MaybePromise } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver, AIVariableService, ResolvedAIVariable } from '@theia/ai-core';
import { GitShellService } from '../common/git-shell-service-protocol';
import { GitDiffCommand, GitStatusCommand } from './git-commands';

export const GIT_STATUS_VARIABLE: AIVariable = {
    id: 'git-status-provider',
    description: 'Gets the git status output for the workspace',
    name: 'git-status'
};

export const GIT_DIFF_VARIABLE: AIVariable = {
    id: 'git-diff-provider',
    description: 'Gets the git diff output for the workspace',
    name: 'git-diff'
};

@injectable()
export class GitVariableContribution implements AIVariableContribution, AIVariableResolver {
    @inject(GitShellService)
    protected readonly gitShellService: GitShellService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(GIT_STATUS_VARIABLE, this);
        service.registerResolver(GIT_DIFF_VARIABLE, this);
    }

    canResolve(_request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        return 1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name === GIT_STATUS_VARIABLE.name) {
            return this.resolveGitVariable(request, GitStatusCommand.id);
        } else if (request.variable.name === GIT_DIFF_VARIABLE.name) {
            return this.resolveGitVariable(request, GitDiffCommand.id);
        }
        return undefined;
    }

    protected async resolveGitVariable(request: AIVariableResolutionRequest, commandId: string): Promise<ResolvedAIVariable> {
        const output = await this.commandService.executeCommand<string>(commandId);
        if (output !== undefined) {
            console.debug('resolved git variable', request.variable.name, output);
            return { variable: request.variable, value: output };
        } else {
            throw new Error('Failed to resolve git variable');
        }
    }
}
