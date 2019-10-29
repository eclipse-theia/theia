/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { Hg, Repository, HgFileChange, WorkingDirectoryStatus } from '../common';
import { Event, Emitter, Disposable, DisposableCollection, CancellationToken, CancellationTokenSource } from '@theia/core';
import { HgRepositoryProvider } from './hg-repository-provider';
import { HgWatcher, HgStatusChangeEvent } from '../common/hg-watcher';
import URI from '@theia/core/lib/common/uri';

import debounce = require('lodash.debounce');

/**
 * The repository tracker watches the selected repository for status changes. It provides a convenient way to listen on status updates.
 */
@injectable()
export class HgRepositoryTracker {

    protected toDispose = new DisposableCollection();
    protected workingDirectoryChanges: HgFileChange[];
    protected readonly onHgEventEmitter = new Emitter<HgStatusChangeEvent | undefined>();

    constructor(
        @inject(Hg) protected readonly hg: Hg,
        @inject(HgRepositoryProvider) protected readonly repositoryProvider: HgRepositoryProvider,
        @inject(HgWatcher) protected readonly hgWatcher: HgWatcher,
    ) { }

    @postConstruct()
    protected async init(): Promise<void> {
        this.updateStatus();
        this.repositoryProvider.onDidChangeRepository(() => this.updateStatus());
    }

    protected updateStatus = debounce(async (): Promise<void> => {
        this.toDispose.dispose();
        const tokenSource = new CancellationTokenSource();
        this.toDispose.push(Disposable.create(() => tokenSource.cancel()));
        const token = tokenSource.token;
        const source = this.selectedRepository;
        if (source) {
            const status = await this.hg.status(source);
            this.setStatus({ source, status }, token);
            this.toDispose.push(this.hgWatcher.onHgEvent(event => {
                if (event.source.localUri === source.localUri) {
                    this.setStatus(event, token);
                }
            }));
            this.toDispose.push(await this.hgWatcher.watchHgChanges(source));
        } else {
            this.setStatus(undefined, token);
        }
    }, 50);

    protected async setStatus(event: HgStatusChangeEvent | undefined, token: CancellationToken): Promise<void> {
        const changes = event ? event.status : [];
        const scmProvider = this.repositoryProvider.selectedScmProvider;
        if (scmProvider) {
            await scmProvider.setStatus(changes, token);
        }
        if (token.isCancellationRequested) {
            return;
        }
        this.workingDirectoryChanges = changes;
        this.onHgEventEmitter.fire(event);
    }

    /**
     * Returns the selected repository, or `undefined` if no repositories are available.
     */
    get selectedRepository(): Repository | undefined {
        return this.repositoryProvider.selectedRepository;
    }

    /**
     * Returns all known repositories.
     */
    get allRepositories(): Repository[] {
        return this.repositoryProvider.allRepositories;
    }

    /**
     * Returns the last known status of the selected respository, or `undefined` if no repositories are available.
     */
    get selectedRepositoryStatus(): WorkingDirectoryStatus {
        return {
            changes: this.workingDirectoryChanges,
            exists: true
        };
    }

    /**
     * Emits when the selected repository has changed.
     */
    get onDidChangeRepository(): Event<Repository | undefined> {
        return this.repositoryProvider.onDidChangeRepository;
    }

    /**
     * Emits when status has changed in the selected repository.
     */
    get onHgEvent(): Event<HgStatusChangeEvent | undefined> {
        return this.onHgEventEmitter.event;
    }

    getPath(uri: URI): string | undefined {
        const { repositoryUri } = this;
        const relativePath = repositoryUri && Repository.relativePath(repositoryUri, uri);
        return relativePath && relativePath.toString();
    }

    getUri(path: string): URI | undefined {
        const { repositoryUri } = this;
        return repositoryUri && repositoryUri.resolve(path);
    }

    get repositoryUri(): URI | undefined {
        const repository = this.selectedRepository;
        return repository && new URI(repository.localUri);
    }

}
