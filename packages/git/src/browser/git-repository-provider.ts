/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { CommitWithChanges, Git, Repository } from '../common';
import { injectable, inject } from 'inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { DisposableCollection, Emitter, Event } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import {
    ScmAmendSupport,
    ScmCommand,
    ScmCommit,
    ScmProvider,
    ScmRepository,
    ScmResourceGroup,
    ScmService
} from '@theia/scm/lib/browser';
import debounce = require('lodash.debounce');
import { GitCommitMessageValidator } from './git-commit-message-validator';

export interface GitRefreshOptions {
    readonly maxCount: number
}

@injectable()
export class GitRepositoryProvider {

    protected readonly onDidChangeRepositoryEmitter = new Emitter<Repository | undefined>();

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(ScmService) protected readonly scmService: ScmService,
        @inject(GitCommitMessageValidator) protected readonly commitMessageValidator: GitCommitMessageValidator
    ) {
        this.initialize();
    }

    protected readonly toDisposeOnWorkspaceChange = new DisposableCollection();
    protected async initialize(): Promise<void> {
        this.scmService.onDidChangeSelectedRepositories(scmRepository => {
            if (scmRepository && scmRepository.provider.contextValue === 'Git') {
                this.onDidChangeRepositoryEmitter.fire({ localUri: scmRepository.provider.rootUri });
            }
        });

        /*
         * Listen for changes to the list of workspaces.  This will not be fired when changes
         * are made inside a workspace.
         */
        this.workspaceService.onWorkspaceChanged(async roots => {
            this.refresh();

            this.toDisposeOnWorkspaceChange.dispose();
            for (const root of roots) {
                const uri = new URI(root.uri);
                this.toDisposeOnWorkspaceChange.push(await this.watcher.watchFileChanges(uri));
            }
        });
        /*
         * Listen for changes within the workspaces.
         */
        this.watcher.onFilesChanged(_changedFiles => {
            this.lazyRefresh();
        });

        if (!(this.scmService.repositories.length === 0)) {
            await this.refresh({ maxCount: 1 });
        }
        await this.refresh();
    }

    protected lazyRefresh: () => Promise<void> = debounce(() => this.refresh(), 1000);

    /**
     * Returns with the previously selected repository, or if no repository has been selected yet,
     * it picks the first available repository from the backend and sets it as the selected one and returns with that.
     * If no repositories are available, returns `undefined`.
     */
    get selectedRepository(): Repository | undefined {
        if (this.scmService.selectedRepository) {
            return { localUri: this.scmService.selectedRepository.provider.rootUri };
        }
    }

    /**
     * Sets or un-sets the repository.
     */
    set selectedRepository(repository: Repository | undefined) {
        if (repository) {
            this.scmService.selectedRepository = this.scmService.repositories.find(scmRepository => scmRepository.provider.rootUri === repository.localUri);
        } else {
            this.scmService.selectedRepository = undefined;
        }
    }

    get onDidChangeRepository(): Event<Repository | undefined> {
        return this.onDidChangeRepositoryEmitter.event;
    }

    /**
     * Returns with all know repositories.
     */
    get allRepositories(): Repository[] {
        return this.scmService.repositories.map(scmRepository => ({ localUri: scmRepository.provider.rootUri }));
    }

    findRepository(uri: URI): Repository | undefined {
        const reposSorted = this.scmService.repositories.map(scmRepo => ({ localUri: scmRepo.provider.rootUri })).sort(Repository.sortComparator);
        return reposSorted.find(repo => new URI(repo.localUri).isEqualOrParent(uri));
    }

    findRepositoryOrSelected(arg: URI | string | { uri?: string | URI } | undefined): Repository | undefined {
        let uri: URI | string | undefined;
        if (arg) {
            if (arg instanceof URI || typeof arg === 'string') {
                uri = arg;
            } else if (typeof arg === 'object' && 'uri' in arg && arg.uri) {
                uri = arg.uri;
            }
            if (uri) {
                if (typeof uri === 'string') {
                    uri = new URI(uri);
                }
                return this.findRepository(uri);
            }
        }
        return this.selectedRepository;
    }

    async refresh(options?: GitRefreshOptions): Promise<void> {
        const roots: FileStat[] = [];
        await this.workspaceService.roots;
        for (const root of this.workspaceService.tryGetRoots()) {
            if (await this.fileSystem.exists(root.uri)) {
                roots.push(root);
            }
        }
        const repoUris: string[] = [];
        const reposOfRoots = await Promise.all(
            roots.map(r => this.git.repositories(r.uri, { ...options }))
        );
        reposOfRoots.forEach(reposPerRoot => {
            reposPerRoot.forEach(repoOfOneRoot => {
                repoUris.push(repoOfOneRoot.localUri);
            });
        });

        repoUris.forEach(uri => {
            if (!this.scmService.repositories.find(scmRepository => scmRepository.provider.rootUri === uri)) {
                this.registerScmProvider(uri);
            }
        });
        this.scmService.repositories.forEach(scmRepository => {
            if (repoUris.indexOf(scmRepository.provider.rootUri) < 0) {
                scmRepository.dispose();
            }
        });
    }

    protected registerScmProvider(uri: string): ScmRepository | undefined {
        const amendSupport: ScmAmendSupport = new GitAmendSupport({ localUri: uri }, this.git);
        const provider = new ScmProviderImpl('Git', uri.substring(uri.lastIndexOf('/') + 1), uri, amendSupport);
        const repo = this.scmService.registerScmProvider(provider);
        repo.input.placeholder = 'Commit message';
        repo.input.validateInput = async input => {
            const validate = await this.commitMessageValidator.validate(input);
            if (validate) {
                const { message, status } = validate;
                return { message, type: status };
            }
        };
        return repo;
    }

}

export class GitAmendSupport implements ScmAmendSupport {

    constructor(protected readonly repository: Repository, protected readonly git: Git) { }

    public async getInitialAmendingCommits(amendingHeadCommitSha: string, latestCommitSha: string): Promise<ScmCommit[]> {
        const commits = await this.git.log(
            this.repository,
            {
                range: { toRevision: amendingHeadCommitSha, fromRevision: latestCommitSha },
                maxCount: 50
            }
        );

        return commits.map(this.createScmCommit);
    }

    public async getMessage(commit: string): Promise<string> {
        return (await this.git.exec(this.repository, ['log', '-n', '1', '--format=%B', commit])).stdout.trim();
    }

    public async reset(commit: string): Promise<void> {
        await this.git.exec(this.repository, ['reset', commit, '--soft']);
    }

    public async getLastCommit(): Promise<ScmCommit | undefined> {
        const commits = await this.git.log(this.repository, { maxCount: 1 });
        if (commits.length > 0) {
            return this.createScmCommit(commits[0]);
        }
    }

    private createScmCommit(gitCommit: CommitWithChanges) {
        return {
            id: gitCommit.sha,
            summary: gitCommit.summary,
            authorName: gitCommit.author.name,
            authorEmail: gitCommit.author.email,
            authorDateRelative: gitCommit.authorDateRelative
        };
    }
}

export class ScmProviderImpl implements ScmProvider {
    private static ID = 0;

    private onDidChangeEmitter = new Emitter<void>();
    private onDidChangeResourcesEmitter = new Emitter<void>();
    private onDidChangeCommitTemplateEmitter = new Emitter<string>();
    private onDidChangeStatusBarCommandsEmitter = new Emitter<ScmCommand[]>();
    private disposableCollection: DisposableCollection = new DisposableCollection();
    private _groups: ScmResourceGroup[];
    private _count: number | undefined;
    readonly handle = 0;

    constructor(
        private _contextValue: string,
        private _label: string,
        private _rootUri: string,
        private _amendSupport: ScmAmendSupport,
    ) {
        this.disposableCollection.push(this.onDidChangeEmitter);
        this.disposableCollection.push(this.onDidChangeResourcesEmitter);
        this.disposableCollection.push(this.onDidChangeCommitTemplateEmitter);
        this.disposableCollection.push(this.onDidChangeStatusBarCommandsEmitter);
    }

    private _id = `scm${ScmProviderImpl.ID++}`;

    get id(): string {
        return this._id;
    }
    get groups(): ScmResourceGroup[] {
        return this._groups;
    }

    set groups(groups: ScmResourceGroup[]) {
        this._groups = groups;
    }

    get label(): string {
        return this._label;
    }

    get rootUri(): string {
        return this._rootUri;
    }

    get contextValue(): string {
        return this._contextValue;
    }

    get onDidChangeResources(): Event<void> {
        return this.onDidChangeResourcesEmitter.event;
    }

    get commitTemplate(): string | undefined {
        return undefined;
    }

    get acceptInputCommand(): ScmCommand | undefined {
        return {
            id: 'git.commit.all',
            tooltip: 'Commit all the staged changes',
            text: 'Commit',
        };
    }

    get statusBarCommands(): ScmCommand[] | undefined {
        return undefined;
    }

    get count(): number | undefined {
        return this._count;
    }

    set count(count: number | undefined) {
        this._count = count;
    }

    get onDidChangeCommitTemplate(): Event<string> {
        return this.onDidChangeCommitTemplateEmitter.event;
    }

    get onDidChangeStatusBarCommands(): Event<ScmCommand[]> {
        return this.onDidChangeStatusBarCommandsEmitter.event;
    }

    get onDidChange(): Event<void> {
        return this.onDidChangeEmitter.event;
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }

    async getOriginalResource(uri: URI): Promise<URI | undefined> {
        return undefined;
    }

    fireChangeStatusBarCommands(commands: ScmCommand[]): void {
        this.onDidChangeStatusBarCommandsEmitter.fire(commands);
    }

    fireChangeResources(): void {
        this.onDidChangeResourcesEmitter.fire(undefined);
    }

    fireChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    get amendSupport(): ScmAmendSupport | undefined {
        return this._amendSupport;
    }
}
