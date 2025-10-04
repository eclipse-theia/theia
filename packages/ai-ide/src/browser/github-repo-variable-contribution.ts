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
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { GitRepositoryProvider } from '@theia/git/lib/browser/git-repository-provider';
import { Git } from '@theia/git/lib/common';

export const GITHUB_REPO_NAME_VARIABLE: AIVariable = {
    id: 'github-repo-name-provider',
    name: 'githubRepoName',
    description: nls.localize('theia/ai/ide/githubRepoName/description', 'The name of the current GitHub repository (e.g., "eclipse-theia/theia")')
};

@injectable()
export class GitHubRepoVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(GitRepositoryProvider)
    protected readonly repositoryProvider: GitRepositoryProvider;

    @inject(Git)
    protected readonly git: Git;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(GITHUB_REPO_NAME_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name !== GITHUB_REPO_NAME_VARIABLE.name) {
            return 0;
        }

        const selectedRepo = this.repositoryProvider.selectedRepository;
        if (!selectedRepo) {
            return 0;
        }

        return 1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== GITHUB_REPO_NAME_VARIABLE.name) {
            return undefined;
        }

        const repository = this.repositoryProvider.selectedRepository;
        if (!repository) {
            return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
        }

        try {
            const remotes = await this.git.remote(repository, { verbose: true });

            // Find GitHub remote (prefer 'origin', then any GitHub remote)
            const githubRemote = remotes.find(remote =>
                (remote.name === 'origin' && this.isGitHubRemote(remote.fetch)) ||
                this.isGitHubRemote(remote.fetch)
            );

            if (!githubRemote) {
                return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
            }

            const repoName = this.extractRepoNameFromGitHubUrl(githubRemote.fetch);
            if (!repoName) {
                return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
            }

            return { variable: request.variable, value: `You are currently working with the GitHub repository: **${repoName}**` };

        } catch (error) {
            console.warn('Failed to resolve GitHub repository name:', error);
            return { variable: request.variable, value: 'No GitHub repository is currently selected or detected.' };
        }
    }

    private isGitHubRemote(remoteUrl: string): boolean {
        return remoteUrl.includes('github.com');
    }

    private extractRepoNameFromGitHubUrl(url: string): string | undefined {

        const httpsMatch = url.match(/https:\/\/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
        if (httpsMatch) {
            return httpsMatch[1];
        }

        const sshMatch = url.match(/git@github\.com:([^\/]+\/[^\/]+?)(?:\.git)?$/);
        if (sshMatch) {
            return sshMatch[1];
        }

        return undefined;
    }
}
