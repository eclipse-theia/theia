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
import { Repository, Hg, CommitWithChanges, HgFileChange, HgFileStatus, WorkingDirectoryStatus } from '../common';
import { HG_RESOURCE_SCHEME } from './hg-resource';
import { HgErrorHandler } from './hg-error-handler';
import { EditorWidget } from '@theia/editor/lib/browser';
import { ScmProvider, ScmCommand, ScmResourceGroup, ScmAmendSupport, ScmCommit, ScmFileChange } from '@theia/scm/lib/browser/scm-provider';
import { HgPrompt } from '../common/hg-prompt';
import { HgCommitDetailWidgetOptions } from './history/hg-commit-detail-widget';

@injectable()
export class HgScmProviderOptions {
    repository: Repository;
}

@injectable()
export class HgScmProvider implements ScmProvider {

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

    @inject(HgErrorHandler)
    protected readonly hgErrorHandler: HgErrorHandler;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(Hg)
    protected readonly hg: Hg;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(HgScmProviderOptions)
    protected readonly options: HgScmProviderOptions;

    // Note: although this is not used, the prompts won't work without an injection on the browser side.
    @inject(HgPrompt)
    protected readonly hgWatcher: HgPrompt;

    readonly id = 'hg';
    readonly label = 'Mercurial';

    dispose(): void {
        this.toDispose.dispose();
    }

    @postConstruct()
    protected init(): void {
        // Amend is temporarily disabled for Mercurial.
        // this._amendSupport = new HgAmendSupport(this, this.repository, this.hg);
    }

    get repository(): Repository {
        return this.options.repository;
    }
    get rootUri(): string {
        return this.repository.localUri;
    }

    protected _amendSupport?: HgAmendSupport;
    get amendSupport(): HgAmendSupport | undefined {
        return this._amendSupport;
    }

    get acceptInputCommand(): ScmCommand | undefined {
        return {
            command: 'hg.commit.all',
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

    protected state = HgScmProvider.initState();

    get groups(): ScmResourceGroup[] {
        return this.state.groups;
    }
    get changes(): HgFileChange[] {
        return this.state.changes;
    }
    get untrackedChanges(): HgFileChange[] {
        return this.state.untrackedChanges;
    }
    get mergeChanges(): HgFileChange[] {
        return this.state.mergeChanges;
    }

    getStatus(): WorkingDirectoryStatus | undefined {
        return this.state.status;
    }
    async setStatus(status: WorkingDirectoryStatus | undefined, token: CancellationToken): Promise<void> {
        const state = HgScmProvider.initState(status);
        if (status) {
            for (const change of status.changes) {
                if (change.status === HgFileStatus.Untracked) {
                    state.untrackedChanges.push(change);
                } else {
                    state.changes.push(change);
                }
            }
        }

        state.groups.push(await this.createGroup('merge', 'Merge Changes', state.mergeChanges, true));
        if (token.isCancellationRequested) {
            return;
        }
        state.groups.push(await this.createGroup('changed', 'Changes', state.changes, false));
        if (token.isCancellationRequested) {
            return;
        }
        state.groups.push(await this.createGroup('untracked', 'Untracked Files', state.untrackedChanges, true));
        if (token.isCancellationRequested) {
            return;
        }
        this.state = state;
        this.fireDidChange();
    }

    protected async createGroup(id: string, label: string, changes: HgFileChange[], hideWhenEmpty?: boolean): Promise<ScmResourceGroup> {
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

    protected async addScmResource(group: ScmResourceGroup, change: HgFileChange): Promise<void> {
        const sourceUri = new URI(change.uri);
        const icon = await this.labelProvider.getIcon(sourceUri);
        group.resources.push({
            group,
            sourceUri,
            decorations: {
                icon,
                letter: HgFileStatus.toAbbreviation(change.status),
                color: HgFileStatus.getColor(change.status),
                tooltip: HgFileStatus.toString(change.status)
            },
            open: async () => this.open(change, { mode: 'reveal' })
        });
    }

    async open(change: HgFileChange, options?: EditorOpenerOptions): Promise<void> {
        const uriToOpen = this.getUriToOpen(change);
        await this.editorManager.open(uriToOpen, options);
    }

    getUriToOpen(change: HgFileChange): URI {
        const changeUri: URI = new URI(change.uri);
        if (change.status === HgFileStatus.Untracked) {
            return changeUri.withScheme(HG_RESOURCE_SCHEME);
        }
        if (change.status === HgFileStatus.New) {
            if (this.changes.find(c => c.uri === change.uri)) {
                return DiffUris.encode(
                    changeUri.withScheme(HG_RESOURCE_SCHEME),
                    changeUri,
                    changeUri.displayName + ' (Working tree)');
            }
            return changeUri;
        }
        if (this.changes.find(c => c.uri === change.uri)) {
            return DiffUris.encode(
                changeUri.withScheme(HG_RESOURCE_SCHEME),
                changeUri,
                changeUri.displayName + ' (Working tree)');
        }
        if (this.mergeChanges.find(c => c.uri === change.uri)) {
            return changeUri;
        }
        return DiffUris.encode(
            changeUri.withScheme(HG_RESOURCE_SCHEME).withQuery('tip'),
            changeUri,
            changeUri.displayName + ' (Working tree)');
    }

    async openChange(change: HgFileChange, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const uriToOpen = this.getUriToOpen(change);
        return this.editorManager.open(uriToOpen, options);
    }

    findChange(uri: URI): HgFileChange | undefined {
        const stringUri = uri.toString();
        const merge = this.mergeChanges.find(c => c.uri.toString() === stringUri);
        if (merge) {
            return merge;
        }
        const unstaged = this.untrackedChanges.find(c => c.uri.toString() === stringUri);
        if (unstaged) {
            return unstaged;
        }
        return this.changes.find(c => c.uri.toString() === stringUri);
    }

    async trackAll(): Promise<void> {
        try {
            await this.hg.add(this.repository, []);
        } catch (error) {
            this.hgErrorHandler.handleError(error);
        }
    }
    async track(uri: string): Promise<void> {
        try {
            const { repository, untrackedChanges, mergeChanges } = this;
            const hasUnstagedChanges = untrackedChanges.some(change => change.uri === uri) || mergeChanges.some(change => change.uri === uri);
            if (hasUnstagedChanges) {
                await this.hg.add(repository, [uri]);
            }
        } catch (error) {
            this.hgErrorHandler.handleError(error);
        }
    }

    async untrack(uri: string): Promise<void> {
        try {
            const { repository, changes } = this;
            if (changes.some(change => change.uri === uri)) {
                await this.hg.forget(repository, [uri]);
            }
        } catch (error) {
            this.hgErrorHandler.handleError(error);
        }
    }

    async discardAll(): Promise<void> {
        if (await this.confirmAll()) {
            try {
                // delete all untracked files, as this matches the behavior of the Git extension.
                const newUris = this.untrackedChanges.filter(c => c.status === HgFileStatus.Untracked).map(c => c.uri);
                this.deleteAll(newUris);
                // revert file changes
                await this.hg.update(this.repository, { clean: true });
            } catch (error) {
                this.hgErrorHandler.handleError(error);
            }
        }
    }
    async discard(uri: string): Promise<void> {
        const { repository } = this;
        const status = this.getStatus();
        if (!(status && status.changes.some(change => change.uri === uri))) {
            return;
        }
        // Allow deletion, only iff the same file is not managed by Hg.
        if (await this.hg.lsFiles(repository, uri)) {
            if (await this.confirm(uri)) {
                try {
                    await this.hg.revert(repository, { uris: [uri] });
                } catch (error) {
                    this.hgErrorHandler.handleError(error);
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
        await this.fileSystem.delete(uri.toString());
    }

    protected async deleteAll(uris: string[]): Promise<void> {
        await Promise.all(uris.map(uri => this.delete(new URI(uri))));
    }

    public createScmCommit(hgCommit: CommitWithChanges): ScmCommit {
        const range = {
            fromRevision: hgCommit.sha + '~1',
            toRevision: hgCommit.sha
        };

        const scmCommit: HgScmCommit = {
            id: hgCommit.sha,
            commitDetailUri: this.toCommitDetailUri(hgCommit.sha),
            summary: hgCommit.summary,
            messageBody: hgCommit.body,
            authorName: hgCommit.author.name,
            authorEmail: hgCommit.author.email,
            authorTimestamp: new Date(hgCommit.author.timestamp * 1000).toISOString(),
            authorDateRelative: hgCommit.authorDateRelative,
            scmProvider: this,
            hgFileChanges: hgCommit.fileChanges.map(change => new HgScmFileChange(change, this, range)),
            get fileChanges(): ScmFileChange[] {
                return this.hgFileChanges!;
            },
            get commitDetailOptions(): HgCommitDetailWidgetOptions {
                return {
                    sha: hgCommit.sha,
                    summary: hgCommit.summary,
                    messageBody: hgCommit.body,
                    authorName: hgCommit.author.name,
                    authorEmail: hgCommit.author.email,
                    authorTimestamp: new Date(hgCommit.author.timestamp * 1000).toISOString(),
                    authorDateRelative: hgCommit.authorDateRelative,
                };
            }
        };
        return scmCommit;
    }

    public relativePath(uri: string): string {
        const parsedUri = new URI(uri);
        const hgRepo = { localUri: this.rootUri };
        const relativePath = Repository.relativePath(hgRepo, parsedUri);
        if (relativePath) {
            return relativePath.toString();
        }
        return this.labelProvider.getLongName(parsedUri);
    }

    protected toCommitDetailUri(commitSha: string): URI {
        return new URI('').withScheme(HgScmProvider.HG_COMMIT_DETAIL).withFragment(commitSha);
    }
}
export namespace HgScmProvider {
    export const HG_COMMIT_DETAIL = 'hg-commit-detail-widget';

    export interface State {
        status?: WorkingDirectoryStatus
        changes: HgFileChange[]
        untrackedChanges: HgFileChange[]
        mergeChanges: HgFileChange[],
        groups: ScmResourceGroup[]
    }
    export function initState(status?: WorkingDirectoryStatus): HgScmProvider.State {
        return {
            status,
            changes: [],
            untrackedChanges: [],
            mergeChanges: [],
            groups: []
        };
    }
    export type ContainerFactory = (options: HgScmProviderOptions) => interfaces.Container;
    export function createFactory(ctx: interfaces.Context): ContainerFactory {
        const typeContainer = ctx.container.get(HgScmProvider.ScmTypeContainer as interfaces.ServiceIdentifier<interfaces.Container>);
        return (options: HgScmProviderOptions) => {
            const container = typeContainer.createChild();
            container.bind(HgScmProviderOptions).toConstantValue(options);
            return container;
        };
    }
    export const ScmTypeContainer = Symbol('HgScmProvider.TypeContainer');
    export const ContainerFactory = Symbol('HgScmProvider.ProviderContainer');
}

export class HgAmendSupport implements ScmAmendSupport {

    constructor(protected readonly provider: HgScmProvider, protected readonly repository: Repository, protected readonly hg: Hg) { }

    public async getInitialAmendingCommits(amendingHeadCommitSha: string, latestCommitSha: string): Promise<ScmCommit[]> {
        const commits = await this.hg.log(
            this.repository,
            {
                range: { toRevision: amendingHeadCommitSha, fromRevision: latestCommitSha },
                follow: true,
                maxCount: 50
            }
        );

        return commits.map(commit => this.provider.createScmCommit(commit));
    }

    public async getMessage(commit: string): Promise<string> {
        // HACK
        if (commit === 'HEAD') {
            commit = '.';
        }
        const response = await this.hg.log(this.repository, { gitExtendedDiffs: false, fullCommitMessages: true, follow: true, revision: commit });
        return response[0].summary;
    }

    public async reset(revision: string): Promise<void> {
        // HACK
        if (revision === 'HEAD~') {
            revision = '.^';
        }
        await this.hg.reset(this.repository, { revision });
    }

    public async getLastCommit(): Promise<ScmCommit | undefined> {
        const commits = await this.hg.log(this.repository, { gitExtendedDiffs: true, follow: true, maxCount: 1 });
        if (commits.length > 0) {
            return this.provider.createScmCommit(commits[0]);
        }
    }
}

export interface HgScmCommit extends ScmCommit {
    scmProvider: HgScmProvider;
    hgFileChanges?: HgScmFileChange[];
}

export class HgScmFileChange implements ScmFileChange {

    constructor(
        protected readonly fileChange: HgFileChange,
        protected readonly scmProvider: HgScmProvider,
        protected readonly range?: Hg.Options.Range
    ) { }

    get uri(): string {
        return this.fileChange.uri;
    }

    getCaption(): string {
        const provider = this.scmProvider;
        let result = `${provider.relativePath(this.fileChange.uri)} - ${HgFileStatus.toString(this.fileChange.status)}`;
        if (this.fileChange.oldUri) {
            result = `${provider.relativePath(this.fileChange.oldUri)} -> ${result}`;
        }
        return result;
    }

    getStatusCaption(): string {
        return HgFileStatus.toString(this.fileChange.status);
    }

    getStatusAbbreviation(): string {
        return HgFileStatus.toAbbreviation(this.fileChange.status);
    }

    getClassNameForStatus(): string {
        return HgFileStatus[this.fileChange.status];
    }

    getUriToOpen(): URI {
        const uri: URI = new URI(this.fileChange.uri);
        let fromURI = this.fileChange.oldUri ? new URI(this.fileChange.oldUri) : uri; // set oldUri on renamed and copied
        if (!this.range) {
            return uri;
        }
        const fromRevision = this.range.fromRevision || '.';
        const toRevision = this.range.toRevision || '.';
        fromURI = fromURI.withScheme(HG_RESOURCE_SCHEME).withQuery(fromRevision.toString());
        const toURI = uri.withScheme(HG_RESOURCE_SCHEME).withQuery(toRevision.toString());
        let uriToOpen = uri;
        if (this.fileChange.status === HgFileStatus.Deleted) {
            uriToOpen = fromURI;
        } else if (this.fileChange.status === HgFileStatus.New) {
            uriToOpen = toURI;
        } else {
            uriToOpen = DiffUris.encode(fromURI, toURI);
        }
        return uriToOpen;
    }
}
