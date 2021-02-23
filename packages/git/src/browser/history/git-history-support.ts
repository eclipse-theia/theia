/********************************************************************************
 * Copyright (C) 2019 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Disposable } from '@theia/core';
import { Git } from '../../common';
import { ScmHistorySupport, HistoryWidgetOptions } from '@theia/scm-extra/lib/browser/history/scm-history-widget';
import { ScmHistoryCommit } from '@theia/scm-extra/lib/browser/scm-file-change-node';
import { GitScmProvider } from '../git-scm-provider';
import { GitRepositoryTracker } from '../git-repository-tracker';

@injectable()
export class GitHistorySupport implements ScmHistorySupport {

    @inject(GitScmProvider) protected readonly provider: GitScmProvider;
    @inject(Git) protected readonly git: Git;
    @inject(GitRepositoryTracker) protected readonly repositoryTracker: GitRepositoryTracker;

    async getCommitHistory(options?: HistoryWidgetOptions): Promise<ScmHistoryCommit[]> {
        const repository = this.provider.repository;
        const gitOptions: Git.Options.Log = {
            uri: options ? options.uri : undefined,
            maxCount: options ? options.maxCount : undefined,
            shortSha: true
        };

        const commits = await this.git.log(repository, gitOptions);
        if (commits.length > 0) {
            return commits.map(commit => this.provider.createScmHistoryCommit(commit));
        } else {
            const pathIsUnderVersionControl = !options || !options.uri || await this.git.lsFiles(repository, options.uri, { errorUnmatch: true });
            if (!pathIsUnderVersionControl) {
                throw new Error('It is not under version control.');
            } else {
                throw new Error('No commits have been committed.');
            }
        }
    }

    protected readonly onDidChangeHistoryEmitter = new Emitter<void>({
        onFirstListenerAdd: () => this.onFirstListenerAdd(),
        onLastListenerRemove: () => this.onLastListenerRemove()
    });
    readonly onDidChangeHistory = this.onDidChangeHistoryEmitter.event;

    protected onGitEventDisposable: Disposable | undefined;
    protected onFirstListenerAdd(): void {
        this.onGitEventDisposable = this.repositoryTracker.onGitEvent(event => {
            const { status, oldStatus } = event || { status: undefined, oldStatus: undefined };
            let isBranchChanged = false;
            let isHeaderChanged = false;
            if (oldStatus) {
                isBranchChanged = !!status && status.branch !== oldStatus.branch;
                isHeaderChanged = !!status && status.currentHead !== oldStatus.currentHead;
            }
            if (isBranchChanged || isHeaderChanged || oldStatus === undefined) {
                this.onDidChangeHistoryEmitter.fire(undefined);
            }
        });
    }

    protected onLastListenerRemove(): void {
        if (this.onGitEventDisposable) {
            this.onGitEventDisposable.dispose();
            this.onGitEventDisposable = undefined;
        }
    }
}
