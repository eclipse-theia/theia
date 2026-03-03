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

export const GitHubRepoService = Symbol('GitHubRepoService');
export const githubRepoServicePath = '/services/github-repo';

export interface GitHubRepoInfo {
    owner: string;
    repo: string;
}

export interface GitHubRepoService {
    /**
     * Gets the GitHub repository information for the given workspace path.
     * @param workspacePath The absolute path to the workspace directory
     * @returns GitHub repository info (owner/repo) or undefined if not a GitHub repository
     */
    getGitHubRepoInfo(workspacePath: string): Promise<GitHubRepoInfo | undefined>;
}
