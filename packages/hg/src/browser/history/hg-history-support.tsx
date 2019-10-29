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

import { inject, injectable } from 'inversify';
import { Emitter, Disposable } from '@theia/core';
import { Hg } from '../../common';
import { ScmHistorySupport, HistoryWidgetOptions } from '@theia/scm/lib/browser/history/scm-history-widget';
import { ScmCommit } from '@theia/scm/lib/browser/scm-provider';
import { HgScmProvider } from '../hg-scm-provider';
import { HgRepositoryTracker } from '../hg-repository-tracker';

@injectable()
export class HgHistorySupport implements ScmHistorySupport {

    @inject(HgScmProvider) protected readonly provider: HgScmProvider;
    @inject(Hg) protected readonly hg: Hg;
    @inject(HgRepositoryTracker) protected readonly repositoryTracker: HgRepositoryTracker;

    async getCommitHistory(options?: HistoryWidgetOptions): Promise<ScmCommit[]> {
        const repository = this.provider.repository;
        const range = { toRevision: '.', fromRevision: '.', ...((options || {}).range || {}) };
        const logOptions = {
            range,
            follow: true
        };
        const commits = await this.hg.log(repository, logOptions);
        if (commits.length > 0) {
            return commits.map(commit => this.provider.createScmCommit(commit));
        } else {
            const pathIsUnderVersionControl = !options || !options.uri || await this.hg.lsFiles(repository, options.uri);
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
        this.onGitEventDisposable = this.repositoryTracker.onHgEvent(event => {
            this.onDidChangeHistoryEmitter.fire(undefined);
        });
    }

    protected onLastListenerRemove(): void {
        if (this.onGitEventDisposable) {
            this.onGitEventDisposable.dispose();
        }
    }
}
