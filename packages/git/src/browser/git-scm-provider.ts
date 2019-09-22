/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct, interfaces } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandService } from '@theia/core/lib/common/command';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { EditorOpenerOptions, EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { FileSystem } from '@theia/filesystem/lib/common';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { Repository, Git, CommitWithChanges, GitFileChange, WorkingDirectoryStatus, GitFileStatus } from '../common';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitErrorHandler } from './git-error-handler';
import { EditorWidget } from '@theia/editor/lib/browser';
import { ScmProvider, ScmCommand, ScmResourceGroup, ScmAmendSupport, ScmCommit } from '@theia/scm/lib/browser/scm-provider';

@injectable()
export class GitScmProviderOptions {
    repository: Repository;
}

@injectable()
export class GitScmProvider implements ScmProvider {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    private readonly onDidChangeStatusBarCommandsEmitter = new Emitter<ScmCommand[] | undefined>();
    readonly onDidChangeStatusBarCommands = this.onDidChangeStatusBarCommandsEmitter.event;

    private readonly toDispose = new DisposableCollection(
        this.onDidChangeEmitter,
        this.onDidChangeStatusBarCommandsEmitter
    );

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(GitErrorHandler)
    protected readonly gitErrorHandler: GitErrorHandler;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(Git)
    protected readonly git: Git;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(GitScmProviderOptions)
    protected readonly options: GitScmProviderOptions;

    readonly id = 'git';
    readonly label = 'Git';

    dispose(): void {
        this.toDispose.dispose();
    }

    @postConstruct()
    protected init(): void {
        this._amendSupport = new GitAmendSupport(this.repository, this.git);
    }

    get repository(): Repository {
        return this.options.repository;
    }
    get rootUri(): string {
        return this.repository.localUri;
    }

    protected _amendSupport: GitAmendSupport;
    get amendSupport(): GitAmendSupport {
        return this._amendSupport;
    }

    get acceptInputCommand(): ScmCommand | undefined {
        return {
            command: 'git.commit.all',
            tooltip: 'Commit all the staged changes',
            title: 'Commit'
        };
    }

    protected _statusBarCommands: ScmCommand[] | undefined;
    get statusBarCommands(): ScmCommand[] | undefined {
        return this._statusBarCommands;
    }
    set statusBarCommands(statusBarCommands: ScmCommand[] | undefined) {
        this._statusBarCommands = statusBarCommands;
        this.onDidChangeStatusBarCommandsEmitter.fire(statusBarCommands);
    }

    protected state = GitScmProvider.initState();

    get groups(): ScmResourceGroup[] {
        return this.state.groups;
    }
    get stagedChanges(): GitFileChange[] {
        return this.state.stagedChanges;
    }
    get unstagedChanges(): GitFileChange[] {
        return this.state.unstagedChanges;
    }
    get mergeChanges(): GitFileChange[] {
        return this.state.mergeChanges;
    }

    getStatus(): WorkingDirectoryStatus | undefined {
        return this.state.status;
    }
    async setStatus(status: WorkingDirectoryStatus | undefined, token: CancellationToken): Promise<void> {
        const state = GitScmProvider.initState(status);
        if (status) {
            for (const change of status.changes) {
                if (GitFileStatus[GitFileStatus.Conflicted.valueOf()] !== GitFileStatus[change.status]) {
                    if (change.staged) {
                        state.stagedChanges.push(change);
                    } else {
                        state.unstagedChanges.push(change);
                    }
                } else {
                    if (!change.staged) {
                        state.mergeChanges.push(change);
                    }
                }
            }
        }
        state.groups.push(await this.createGroup('merge', 'Merge Changes', state.mergeChanges, true));
        if (token.isCancellationRequested) {
            return;
        }
        state.groups.push(await this.createGroup('index', 'Staged changes', state.stagedChanges, true));
        if (token.isCancellationRequested) {
            return;
        }
        state.groups.push(await this.createGroup('workingTree', 'Changes', state.unstagedChanges, false));
        if (token.isCancellationRequested) {
            return;
        }
        this.state = state;
        this.fireDidChange();
    }

    protected async createGroup(id: string, label: string, changes: GitFileChange[], hideWhenEmpty?: boolean): Promise<ScmResourceGroup> {
        const group: ScmResourceGroup = {
            id,
            label,
            hideWhenEmpty,
            provider: this,
            resources: [],
            dispose: () => { }
        };
        const creatingResources: Promise<void>[] = [];
        for (const change of changes) {
            creatingResources.push(this.addScmResource(group, change));
        }
        await Promise.all(creatingResources);
        return group;
    }

    protected async addScmResource(group: ScmResourceGroup, change: GitFileChange): Promise<void> {
        const sourceUri = new URI(change.uri);
        const icon = await this.labelProvider.getIcon(sourceUri);
        group.resources.push({
            group,
            sourceUri,
            decorations: {
                icon,
                letter: GitFileStatus.toAbbreviation(change.status, change.staged),
                color: GitFileStatus.getColor(change.status, change.staged),
                tooltip: GitFileStatus.toString(change.status)
            },
            open: async () => this.open(change, { mode: 'reveal' })
        });
    }

    async open(change: GitFileChange, options?: EditorOpenerOptions): Promise<void> {
        const uriToOpen = this.getUriToOpen(change);
        await this.editorManager.open(uriToOpen, options);
    }

    getUriToOpen(change: GitFileChange): URI {
        const changeUri: URI = new URI(change.uri);
        if (change.status !== GitFileStatus.New) {
            if (change.staged) {
                return DiffUris.encode(
                    changeUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                    changeUri.withScheme(GIT_RESOURCE_SCHEME),
                    changeUri.displayName + ' (Index)');
            }
            if (this.stagedChanges.find(c => c.uri === change.uri)) {
                return DiffUris.encode(
                    changeUri.withScheme(GIT_RESOURCE_SCHEME),
                    changeUri,
                    changeUri.displayName + ' (Working tree)');
            }
            if (this.mergeChanges.find(c => c.uri === change.uri)) {
                return changeUri;
            }
            return DiffUris.encode(
                changeUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                changeUri,
                changeUri.displayName + ' (Working tree)');
        }
        if (change.staged) {
            return changeUri.withScheme(GIT_RESOURCE_SCHEME);
        }
        if (this.stagedChanges.find(c => c.uri === change.uri)) {
            return DiffUris.encode(
                changeUri.withScheme(GIT_RESOURCE_SCHEME),
                changeUri,
                changeUri.displayName + ' (Working tree)');
        }
        return changeUri;
    }

    async openChange(change: GitFileChange, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const uriToOpen = this.getUriToOpen(change);
        return this.editorManager.open(uriToOpen, options);
    }

    findChange(uri: URI): GitFileChange | undefined {
        const stringUri = uri.toString();
        const merge = this.mergeChanges.find(c => c.uri.toString() === stringUri);
        if (merge) {
            return merge;
        }
        const unstaged = this.unstagedChanges.find(c => c.uri.toString() === stringUri);
        if (unstaged) {
            return unstaged;
        }
        return this.stagedChanges.find(c => c.uri.toString() === stringUri);
    }

    async stageAll(): Promise<void> {
        try {
            // TODO resolve deletion conflicts
            // TODO confirm staging unresolved files
            await this.git.add(this.repository, []);
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }
    async stage(uri: string): Promise<void> {
        try {
            const { repository, unstagedChanges, mergeChanges } = this;
            const hasUnstagedChanges = unstagedChanges.some(change => change.uri === uri) || mergeChanges.some(change => change.uri === uri);
            if (hasUnstagedChanges) {
                // TODO resolve deletion conflicts
                // TODO confirm staging of a unresolved file
                await this.git.add(repository, uri);
            }
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }

    async unstageAll(): Promise<void> {
        try {
            const { repository, stagedChanges } = this;
            const uris = stagedChanges.map(c => c.uri);
            await this.git.unstage(repository, uris);
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }
    async unstage(uri: string): Promise<void> {
        try {
            const { repository, stagedChanges } = this;
            if (stagedChanges.some(change => change.uri === uri)) {
                await this.git.unstage(repository, uri);
            }
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }

    async discardAll(): Promise<void> {
        if (await this.confirmAll()) {
            try {
                // discard new files
                const newUris = this.unstagedChanges.filter(c => c.status === GitFileStatus.New).map(c => c.uri);
                this.deleteAll(newUris);
                // unstage changes
                const uris = this.unstagedChanges.map(c => c.uri);
                await this.git.unstage(this.repository, uris, { treeish: 'HEAD', reset: 'working-tree' });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        }
    }
    async discard(uri: string): Promise<void> {
        const { repository } = this;
        const status = this.getStatus();
        if (!(status && status.changes.some(change => change.uri === uri))) {
            return;
        }
        // Allow deletion, only iff the same file is not yet in the Git index.
        if (await this.git.lsFiles(repository, uri, { errorUnmatch: true })) {
            if (await this.confirm(uri)) {
                try {
                    await this.git.unstage(repository, uri, { treeish: 'HEAD', reset: 'working-tree' });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            }
        } else {
            await this.commands.executeCommand(WorkspaceCommands.FILE_DELETE.id, new URI(uri));
        }
    }

    protected confirm(path: string): Promise<boolean | undefined> {
        const uri = new URI(path);
        return new ConfirmDialog({
            title: 'Discard changes',
            msg: `Do you really want to discard changes in ${uri.displayName}?`
        }).open();
    }

    protected confirmAll(): Promise<boolean | undefined> {
        return new ConfirmDialog({
            title: 'Discard All Changes',
            msg: 'Do you really want to discard all changes?'
        }).open();
    }

    protected async delete(uri: URI): Promise<void> {
        try {
            await this.fileSystem.delete(uri.toString());
        } catch (e) {
            console.error(e);
        }
    }

    protected async deleteAll(uris: string[]): Promise<void> {
        await Promise.all(uris.map(uri => this.delete(new URI(uri))));
    }

}
export namespace GitScmProvider {
    export interface State {
        status?: WorkingDirectoryStatus
        stagedChanges: GitFileChange[]
        unstagedChanges: GitFileChange[]
        mergeChanges: GitFileChange[],
        groups: ScmResourceGroup[]
    }
    export function initState(status?: WorkingDirectoryStatus): GitScmProvider.State {
        return {
            status,
            stagedChanges: [],
            unstagedChanges: [],
            mergeChanges: [],
            groups: []
        };
    }
    export const Factory = Symbol('GitScmProvider.Factory');
    export type Factory = (options: GitScmProviderOptions) => GitScmProvider;
    export function createFactory(ctx: interfaces.Context): Factory {
        return (options: GitScmProviderOptions) => {
            const container = ctx.container.createChild();
            container.bind(GitScmProviderOptions).toConstantValue(options);
            container.bind(GitScmProvider).toSelf().inSingletonScope();
            return container.get(GitScmProvider);
        };
    }
}

export class GitAmendSupport implements ScmAmendSupport {

    constructor(protected readonly repository: Repository, protected readonly git: Git) { }

    public async getInitialAmendingCommits(amendingHeadCommitSha: string, latestCommitSha: string): Promise<ScmCommit[]> {
        const commits = await this.git.log(
            this.repository,
            {
                range: { toRevision: amendingHeadCommitSha, fromRevision: latestCommitSha },
                firstParent: true,
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

    private createScmCommit(gitCommit: CommitWithChanges): {
        id: string;
        summary: string;
        authorName: string;
        authorEmail: string;
        authorDateRelative: string;
    } {
        return {
            id: gitCommit.sha,
            summary: gitCommit.summary,
            authorName: gitCommit.author.name,
            authorEmail: gitCommit.author.email,
            authorDateRelative: gitCommit.authorDateRelative
        };
    }
}
