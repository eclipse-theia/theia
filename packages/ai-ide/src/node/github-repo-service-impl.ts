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

import { injectable } from '@theia/core/shared/inversify';
import { simpleGit, SimpleGit } from 'simple-git';
import { GitHubRepoService, GitHubRepoInfo } from '../common/github-repo-protocol';

@injectable()
export class GitHubRepoServiceImpl implements GitHubRepoService {

    async getGitHubRepoInfo(workspacePath: string): Promise<GitHubRepoInfo | undefined> {
        try {
            // Initialize simple-git with the workspace path
            const git: SimpleGit = simpleGit(workspacePath);

            // Check if this is a git repository
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                return undefined;
            }

            // Get all remotes with their URLs
            const remotes = await git.getRemotes(true);

            if (remotes.length === 0) {
                return undefined;
            }

            // Find GitHub remote (prefer 'origin', then any GitHub remote)
            const githubRemote = remotes.find(remote =>
                remote.name === 'origin' && this.isGitHubRemote(remote.refs.fetch || remote.refs.push || '')
            ) || remotes.find(remote =>
                this.isGitHubRemote(remote.refs.fetch || remote.refs.push || '')
            );

            if (!githubRemote) {
                return undefined;
            }

            const remoteUrl = githubRemote.refs.fetch || githubRemote.refs.push || '';
            const repoInfo = this.extractRepoInfoFromGitHubUrl(remoteUrl);

            return repoInfo;

        } catch (error) {
            console.warn('Failed to get GitHub repository info:', error);
            return undefined;
        }
    }

    private isGitHubRemote(remoteUrl: string): boolean {
        return remoteUrl.includes('github.com');
    }

    private extractRepoInfoFromGitHubUrl(url: string): GitHubRepoInfo | undefined {
        // Handle HTTPS URLs: https://github.com/owner/repo or https://github.com/owner/repo.git
        const httpsMatch = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
        if (httpsMatch) {
            return {
                owner: httpsMatch[1],
                repo: httpsMatch[2]
            };
        }

        // Handle SSH URLs: git@github.com:owner/repo or git@github.com:owner/repo.git
        const sshMatch = url.match(/git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/);
        if (sshMatch) {
            return {
                owner: sshMatch[1],
                repo: sshMatch[2]
            };
        }

        // Handle alternative SSH format: ssh://git@github.com/owner/repo or ssh://git@github.com/owner/repo.git
        const sshAltMatch = url.match(/ssh:\/\/git@github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
        if (sshAltMatch) {
            return {
                owner: sshAltMatch[1],
                repo: sshAltMatch[2]
            };
        }

        return undefined;
    }
}
