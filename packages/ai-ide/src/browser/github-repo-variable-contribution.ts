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
    description: nls.localize('theia/ai/ide/githubRepoName/description',
        'The GitHub repositories associated with the workspace roots (e.g., "eclipse-theia/theia")')
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

            const repoResults = await Promise.all(
                workspaceRoots.map(async root => {
                    const rootPath = root.resource.path.fsPath();
                    const rootName = root.resource.path.base;
                    try {
                        const info = await this.gitHubRepoService.getGitHubRepoInfo(rootPath);
                        return info ? { rootName, repoName: `${info.owner}/${info.repo}` } : undefined;
                    } catch {
                        return undefined;
                    }
                })
            );

            const found = repoResults.filter((r): r is { rootName: string; repoName: string } => r !== undefined);

            if (found.length === 0) {
                return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
            }

            const uniqueRepos = new Map<string, string[]>();
            for (const { rootName, repoName } of found) {
                const roots = uniqueRepos.get(repoName);
                if (roots) {
                    roots.push(rootName);
                } else {
                    uniqueRepos.set(repoName, [rootName]);
                }
            }

            if (uniqueRepos.size === 1) {
                const [repoName] = uniqueRepos.keys();
                return { variable: request.variable, value: `You are currently working with the GitHub repository: **${repoName}**` };
            }

            const lines = Array.from(uniqueRepos.entries()).map(
                ([repoName, roots]) => `- **${repoName}** (${roots.join(', ')})`
            );
            return {
                variable: request.variable,
                value: `You are currently working with the following GitHub repositories:\n${lines.join('\n')}`
            };

        } catch (error) {
            console.warn('Failed to resolve GitHub repository name:', error);
            return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
        }
    }
}
