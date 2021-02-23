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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { Emitter } from '@theia/core';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandService } from '@theia/core/lib/common/command';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { EditorOpenerOptions, EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { Repository, Git, CommitWithChanges, GitFileChange, WorkingDirectoryStatus, GitFileStatus } from '../common';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitErrorHandler } from './git-error-handler';
import { EditorWidget } from '@theia/editor/lib/browser';
import { ScmProvider, ScmCommand, ScmResourceGroup, ScmAmendSupport, ScmCommit } from '@theia/scm/lib/browser/scm-provider';
import { ScmHistoryCommit, ScmFileChange } from '@theia/scm-extra/lib/browser/scm-file-change-node';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { GitCommitDetailWidgetOptions } from './history/git-commit-detail-widget-options';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ScmInput } from '@theia/scm/lib/browser/scm-input';

@injectable()
export class GitScmProviderOptions {
    repository: Repository;
}

@injectable()
export class GitScmProvider implements ScmProvider {

    public input: ScmInput;

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

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(Git)
    protected readonly git: Git;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(GitScmProviderOptions)
    protected readonly options: GitScmProviderOptions;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    readonly id = 'git';
    readonly label = 'Git';

    dispose(): void {
        this.toDispose.dispose();
    }

    @postConstruct()
    protected init(): void {
        this._amendSupport = new GitAmendSupport(this, this.repository, this.git);
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
    setStatus(status: WorkingDirectoryStatus | undefined): void {
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
        state.groups.push(this.createGroup('merge', 'Merge Changes', state.mergeChanges, true));
        state.groups.push(this.createGroup('index', 'Staged changes', state.stagedChanges, true));
        state.groups.push(this.createGroup('workingTree', 'Changes', state.unstagedChanges, false));
        this.state = state;
        this.input.placeholder = `Message (press {0} to commit${status && status.branch ? ' on \'' + status.branch + '\'' : ''})`;
        this.fireDidChange();
    }

    protected createGroup(id: string, label: string, changes: GitFileChange[], hideWhenEmpty?: boolean): ScmResourceGroup {
        const group: ScmResourceGroup = {
            id,
            label,
            hideWhenEmpty,
            provider: this,
            resources: [],
            dispose: () => { }
        };
        for (const change of changes) {
            this.addScmResource(group, change);
        }
        return group;
    }

    protected addScmResource(group: ScmResourceGroup, change: GitFileChange): void {
        const sourceUri = new URI(change.uri);
        group.resources.push({
            group,
            sourceUri,
            decorations: {
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
        const fromFileUri = change.oldUri ? new URI(change.oldUri) : changeUri; // set oldUri on renamed and copied
        if (change.status === GitFileStatus.Deleted) {
            if (change.staged) {
                return changeUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD');
            } else {
                return changeUri.withScheme(GIT_RESOURCE_SCHEME);
            }
        }
        if (change.status !== GitFileStatus.New) {
            if (change.staged) {
                return DiffUris.encode(
                    fromFileUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                    changeUri.withScheme(GIT_RESOURCE_SCHEME),
                    this.labelProvider.getName(changeUri) + ' (Index)');
            }
            if (this.stagedChanges.find(c => c.uri === change.uri)) {
                return DiffUris.encode(
                    fromFileUri.withScheme(GIT_RESOURCE_SCHEME),
                    changeUri,
                    this.labelProvider.getName(changeUri) + ' (Working tree)');
            }
            if (this.mergeChanges.find(c => c.uri === change.uri)) {
                return changeUri;
            }
            return DiffUris.encode(
                fromFileUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                changeUri,
                this.labelProvider.getName(changeUri) + ' (Working tree)');
        }
        if (change.staged) {
            return changeUri.withScheme(GIT_RESOURCE_SCHEME);
        }
        if (this.stagedChanges.find(c => c.uri === change.uri)) {
            return DiffUris.encode(
                changeUri.withScheme(GIT_RESOURCE_SCHEME),
                changeUri,
                this.labelProvider.getName(changeUri) + ' (Working tree)');
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
    async stage(uriArg: string | string[]): Promise<void> {
        try {
            const { repository, unstagedChanges, mergeChanges } = this;
            const uris = Array.isArray(uriArg) ? uriArg : [uriArg];
            const unstagedUris = uris
                .filter(uri => {
                    const resourceUri = new URI(uri);
                    return unstagedChanges.some(change => resourceUri.isEqualOrParent(new URI(change.uri)))
                        || mergeChanges.some(change => resourceUri.isEqualOrParent(new URI(change.uri)));
                }
                );
            if (unstagedUris.length !== 0) {
                // TODO resolve deletion conflicts
                // TODO confirm staging of a unresolved file
                await this.git.add(repository, uris);
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
    async unstage(uriArg: string | string[]): Promise<void> {
        try {
            const { repository, stagedChanges } = this;
            const uris = Array.isArray(uriArg) ? uriArg : [uriArg];
            const stagedUris = uris
                .filter(uri => {
                    const resourceUri = new URI(uri);
                    return stagedChanges.some(change => resourceUri.isEqualOrParent(new URI(change.uri)));
                }
                );
            if (stagedUris.length !== 0) {
                await this.git.unstage(repository, uris);
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
    async discard(uriArg: string | string[]): Promise<void> {
        const { repository } = this;
        const uris = Array.isArray(uriArg) ? uriArg : [uriArg];

        const status = this.getStatus();
        if (!status) {
            return;
        }

        const pairs = await Promise.all(
            uris
                .filter(uri => {
                    const uriAsUri = new URI(uri);
                    return status.changes.some(change => uriAsUri.isEqualOrParent(new URI(change.uri)));
                })
                .map(uri => {
                    const includeIndexFlag = async () => {
                        // Allow deletion, only iff the same file is not yet in the Git index.
                        const isInIndex = await this.git.lsFiles(repository, uri, { errorUnmatch: true });
                        return { uri, isInIndex };
                    };
                    return includeIndexFlag();
                })
        );

        const urisInIndex = pairs.filter(pair => pair.isInIndex).map(pair => pair.uri);
        if (urisInIndex.length !== 0) {
            if (!await this.confirm(urisInIndex)) {
                return;
            }
        }

        await Promise.all(
            pairs.map(pair => {
                const discardSingle = async () => {
                    if (pair.isInIndex) {
                        try {
                            await this.git.unstage(repository, pair.uri, { treeish: 'HEAD', reset: 'working-tree' });
                        } catch (error) {
                            this.gitErrorHandler.handleError(error);
                        }
                    } else {
                        await this.commands.executeCommand(WorkspaceCommands.FILE_DELETE.id, new URI(pair.uri));
                    }
                };
                return discardSingle();
            })
        );
    }

    protected confirm(paths: string[]): Promise<boolean | undefined> {
        let fileText: string;
        if (paths.length <= 3) {
            fileText = paths.map(path => this.labelProvider.getName(new URI(path))).join(', ');
        } else {
            fileText = `${paths.length} files`;
        }
        return new ConfirmDialog({
            title: 'Discard changes',
            msg: `Do you really want to discard changes in ${fileText}?`
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
            await this.fileService.delete(uri, { recursive: true });
        } catch (e) {
            console.error(e);
        }
    }

    protected async deleteAll(uris: string[]): Promise<void> {
        await Promise.all(uris.map(uri => this.delete(new URI(uri))));
    }

    public createScmCommit(gitCommit: CommitWithChanges): ScmCommit {
        const scmCommit: ScmCommit = {
            id: gitCommit.sha,
            summary: gitCommit.summary,
            authorName: gitCommit.author.name,
            authorEmail: gitCommit.author.email,
            authorDateRelative: gitCommit.authorDateRelative,
        };
        return scmCommit;
    }

    public createScmHistoryCommit(gitCommit: CommitWithChanges): ScmHistoryCommit {
        const range = {
            fromRevision: gitCommit.sha + '~1',
            toRevision: gitCommit.sha
        };

        const scmCommit: GitScmCommit = {
            ...this.createScmCommit(gitCommit),
            commitDetailUri: this.toCommitDetailUri(gitCommit.sha),
            scmProvider: this,
            gitFileChanges: gitCommit.fileChanges.map(change => new GitScmFileChange(change, this, range)),
            get fileChanges(): ScmFileChange[] {
                return this.gitFileChanges;
            },
            get commitDetailOptions(): GitCommitDetailWidgetOptions {
                return {
                    rootUri: this.scmProvider.rootUri,
                    commitSha: gitCommit.sha,
                    commitMessage: gitCommit.summary,
                    messageBody: gitCommit.body,
                    authorName: gitCommit.author.name,
                    authorEmail: gitCommit.author.email,
                    authorDate: gitCommit.author.timestamp,
                    authorDateRelative: gitCommit.authorDateRelative,
                };
            }
        };
        return scmCommit;
    }

    public relativePath(uri: string): string {
        const parsedUri = new URI(uri);
        const gitRepo = { localUri: this.rootUri };
        const relativePath = Repository.relativePath(gitRepo, parsedUri);
        if (relativePath) {
            return relativePath.toString();
        }
        return this.labelProvider.getLongName(parsedUri);
    }

    protected toCommitDetailUri(commitSha: string): URI {
        return new URI('').withScheme(GitScmProvider.GIT_COMMIT_DETAIL).withFragment(commitSha);
    }
}

export namespace GitScmProvider {
    export const GIT_COMMIT_DETAIL = 'git-commit-detail-widget';

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
}

export class GitAmendSupport implements ScmAmendSupport {

    constructor(protected readonly provider: GitScmProvider, protected readonly repository: Repository, protected readonly git: Git) { }

    public async getInitialAmendingCommits(amendingHeadCommitSha: string, latestCommitSha: string | undefined): Promise<ScmCommit[]> {
        const commits = await this.git.log(
            this.repository,
            {
                range: { toRevision: amendingHeadCommitSha, fromRevision: latestCommitSha },
                maxCount: 50
            }
        );

        return commits.map(commit => this.provider.createScmCommit(commit));
    }

    public async getMessage(commit: string): Promise<string> {
        return (await this.git.exec(this.repository, ['log', '-n', '1', '--format=%B', commit])).stdout.trim();
    }

    public async reset(commit: string): Promise<void> {
        if (commit === 'HEAD~' && await this.isHeadInitialCommit()) {
            await this.git.exec(this.repository, ['update-ref', '-d', 'HEAD']);
        } else {
            await this.git.exec(this.repository, ['reset', commit, '--soft']);
        }
    }

    protected async isHeadInitialCommit(): Promise<boolean> {
        const result = await this.git.revParse(this.repository, { ref: 'HEAD~' });
        return !result;
    }

    public async getLastCommit(): Promise<ScmCommit | undefined> {
        const commits = await this.git.log(this.repository, { maxCount: 1 });
        if (commits.length > 0) {
            return this.provider.createScmCommit(commits[0]);
        }
    }
}

export interface GitScmCommit extends ScmHistoryCommit {
    scmProvider: GitScmProvider;
    gitFileChanges: GitScmFileChange[];
}

export class GitScmFileChange implements ScmFileChange {

    constructor(
        protected readonly fileChange: GitFileChange,
        protected readonly scmProvider: GitScmProvider,
        protected readonly range?: Git.Options.Range
    ) { }

    get gitFileChange(): GitFileChange {
        return this.fileChange;
    }

    get uri(): string {
        return this.fileChange.uri;
    }

    getCaption(): string {
        const provider = this.scmProvider;
        let result = `${provider.relativePath(this.fileChange.uri)} - ${GitFileStatus.toString(this.fileChange.status, true)}`;
        if (this.fileChange.oldUri) {
            result = `${provider.relativePath(this.fileChange.oldUri)} -> ${result}`;
        }
        return result;
    }

    getStatusCaption(): string {
        return GitFileStatus.toString(this.fileChange.status, true);
    }

    getStatusAbbreviation(): string {
        return GitFileStatus.toAbbreviation(this.fileChange.status, this.fileChange.staged);
    }

    getClassNameForStatus(): string {
        return 'git-status staged ' + GitFileStatus[this.fileChange.status].toLowerCase();
    }

    getUriToOpen(): URI {
        const uri: URI = new URI(this.fileChange.uri);
        const fromFileURI = this.fileChange.oldUri ? new URI(this.fileChange.oldUri) : uri; // set oldUri on renamed and copied
        if (!this.range) {
            return uri;
        }
        const fromURI = this.range.fromRevision
            ? fromFileURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.range.fromRevision.toString())
            : fromFileURI;
        const toURI = this.range.toRevision
            ? uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.range.toRevision.toString())
            : uri;
        let uriToOpen = uri;
        if (this.fileChange.status === GitFileStatus.Deleted) {
            uriToOpen = fromURI;
        } else if (this.fileChange.status === GitFileStatus.New) {
            uriToOpen = toURI;
        } else {
            uriToOpen = DiffUris.encode(fromURI, toURI);
        }
        return uriToOpen;
    }
}
