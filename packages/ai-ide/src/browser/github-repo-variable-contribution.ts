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

import { injectable, inject } from '@theia/core/shared/inversify';
import { MaybePromise, nls } from '@theia/core';
import {
    AIVariableContribution,
    AIVariableResolver,
    AIVariableService,
    AIVariableResolutionRequest,
    AIVariableContext,
    ResolvedAIVariable,
    AIVariable
} from '@theia/ai-core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

import { GitHubRepoService } from '../common/github-repo-protocol';

export const GITHUB_REPO_NAME_VARIABLE: AIVariable = {
    id: 'github-repo-name-provider',
    name: 'githubRepoName',
    description: nls.localize('theia/ai/ide/githubRepoName/description', 'The name of the current GitHub repository (e.g., "eclipse-theia/theia")')
};

@injectable()
export class GitHubRepoVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(GitHubRepoService)
    protected readonly gitHubRepoService: GitHubRepoService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(GITHUB_REPO_NAME_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name !== GITHUB_REPO_NAME_VARIABLE.name) {
            return 0;
        }

        return 1;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== GITHUB_REPO_NAME_VARIABLE.name) {
            return undefined;
        }

        try {
            const workspaceRoots = await this.workspaceService.roots;
            if (workspaceRoots.length === 0) {
                return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
            }

            // Get the filesystem path from the workspace root URI
            const workspaceRoot = workspaceRoots[0].resource;
            const workspacePath = workspaceRoot.path.fsPath();

            // Use the backend service to get GitHub repository information
            const repoInfo = await this.gitHubRepoService.getGitHubRepoInfo(workspacePath);

            if (!repoInfo) {
                return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
            }

            const repoName = `${repoInfo.owner}/${repoInfo.repo}`;
            return { variable: request.variable, value: `You are currently working with the GitHub repository: **${repoName}**` };

        } catch (error) {
            console.warn('Failed to resolve GitHub repository name:', error);
            return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
        }
    }
}
