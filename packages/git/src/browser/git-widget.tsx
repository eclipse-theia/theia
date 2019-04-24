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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ResourceProvider, CommandService, MenuPath } from '@theia/core';
import { DisposableCollection } from '@theia/core/lib/common';
import { ContextMenuRenderer, LabelProvider, DiffUris, StatefulWidget, Message, SELECTED_CLASS, Key, ConfirmDialog, StorageService } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget, EditorOpenerOptions } from '@theia/editor/lib/browser';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { Git, GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus, CommitWithChanges } from '../common';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitCommitMessageValidator } from './git-commit-message-validator';
import { GitAvatarService } from './history/git-avatar-service';
import * as React from 'react';
import { GitErrorHandler } from './git-error-handler';
import { GitDiffWidget } from './diff/git-diff-widget';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { GitFileChangeNode } from './git-file-change-node';
import { FileSystem } from '@theia/filesystem/lib/common';

const REPOSITORY_STORAGE_KEY = 'repository';

@injectable()
export class GitWidget extends GitDiffWidget implements StatefulWidget {

    private static MESSAGE_BOX_MIN_HEIGHT = 25;
    private static TRANSITION_TIME_MS = 500;

    protected stagedChanges: GitFileChangeNode[] = [];
    protected unstagedChanges: GitFileChangeNode[] = [];
    protected mergeChanges: GitFileChangeNode[] = [];
    protected incomplete?: boolean;
    protected message: string = '';
    protected messageBoxHeight: number = GitWidget.MESSAGE_BOX_MIN_HEIGHT;
    protected status: WorkingDirectoryStatus | undefined;
    protected scrollContainer: string;
    protected commitMessageValidationResult: GitCommitMessageValidator.Result | undefined;
    protected amendingCommits: { commit: CommitWithChanges, avatar: string }[] = [];
    protected lastCommit: { commit: CommitWithChanges, avatar: string } | undefined;

    /**
     * This is used for transitioning.  When setting up a transition, we first set to render
     * the elements in their starting positions.  This includes creating the elements to be
     * transitioned in, even though those controls will not be visible when state is 'start'.
     * On the next frame after 'start', we render elements with their final positions and with
     * the transition properties.
     */
    protected transition: {
        state: 'none'
    } | {
        state: 'start' | 'transitioning',
        direction: 'up' | 'down',
        previousLastCommit: { commit: CommitWithChanges, avatar: string }
    } = { state: 'none' };

    /**
     * a hint on how to animate an update, set by certain user action handlers
     * and used when updating the view based on a Git repository change
     */
    protected transitionHint: 'none' | 'amend' | 'unamend' = 'none';
    protected lastHead: string | undefined;
    protected lastSelectedNode?: { id: number, node: GitFileChangeNode };
    protected listContainer: GitChangesListContainer | undefined;
    protected readonly selectChange = (change: GitFileChangeNode) => this.selectNode(change);

    protected readonly toDisposeOnInitialize = new DisposableCollection();

    protected lastCommitHeight: number = 0;
    lastCommitScrollRef = (instance: HTMLDivElement) => {
        if (this.lastCommitHeight === 0) {
            this.lastCommitHeight = instance.getBoundingClientRect().height;
        }
    }

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(GitErrorHandler)
    protected readonly gitErrorHandler: GitErrorHandler;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(GitAvatarService) protected readonly avatarService: GitAvatarService,
        @inject(GitCommitMessageValidator) protected readonly commitMessageValidator: GitCommitMessageValidator) {

        super();
        this.id = 'theia-gitContainer';
        this.title.label = 'Git';
        this.title.caption = 'Git';
        this.title.iconClass = 'git-tab-icon';
        this.title.closable = true;
        this.scrollContainer = GitWidget.Styles.CHANGES_CONTAINER;
        this.addClass('theia-git');
        this.node.tabIndex = 0;
    }

    @postConstruct()
    protected init() {
        this.toDispose.push(this.repositoryProvider.onDidChangeRepository(repository =>
            this.initialize(repository)
        ));
        this.initialize(this.repositoryProvider.selectedRepository);
        this.gitNodes = [];
        this.update();
    }

    async initialize(repository: Repository | undefined): Promise<void> {
        this.toDisposeOnInitialize.dispose();
        if (repository) {
            this.toDispose.push(this.toDisposeOnInitialize);
            this.toDisposeOnInitialize.push(await this.gitWatcher.watchGitChanges(repository));
            this.toDisposeOnInitialize.push(this.gitWatcher.onGitEvent(async gitEvent => {
                if (GitStatusChangeEvent.is(gitEvent)) {
                    if (gitEvent.status.currentHead !== this.lastHead) {
                        this.lastHead = gitEvent.status.currentHead;

                        const nextCommit = gitEvent.status.currentHead ? await this.getLastCommit() : undefined;
                        if (nextCommit && this.lastCommit && nextCommit.commit.sha === this.lastCommit.commit.sha) {
                            // No change here
                        } else if (nextCommit === undefined && this.lastCommit === undefined) {
                            // No change here
                        } else if (this.transitionHint === 'none') {
                            if (this.lastCommit) {
                                // If the 'last' commit changes, but we are not expecting an 'amend'
                                // or 'unamend' to occur, then we clear out the list of amended commits.
                                // This is because an unexpected change has happened to the repoistory,
                                // perhaps the user commited, merged, or something.  The amended commits
                                // will no longer be valid.
                                await this.clearAmendingCommits(repository);
                                // There is a change to the last commit, but no transition hint so
                                // the view just updates without transition.
                                this.lastCommit = nextCommit;
                                this.amendingCommits = [];
                            } else {
                                // First time through, so initialize amending list
                                this.lastCommit = nextCommit;
                                this.amendingCommits = await this.buildAmendingList(repository);
                            }
                        } else {
                            if (this.lastCommit) {
                                const direction = this.transitionHint === 'amend' ? 'up' : 'down';
                                this.transition = { state: 'start', direction, previousLastCommit: this.lastCommit };
                                switch (this.transitionHint) {
                                    case 'amend':
                                        if (this.lastCommit) {
                                            this.amendingCommits.push(this.lastCommit);
                                            if (this.amendingCommits.length === 1) {
                                                const storageKey = this.getStorageKey(repository);
                                                this.storageService.setData<string | undefined>(storageKey, this.amendingCommits[0].commit.sha);
                                            }
                                        }
                                        break;
                                    case 'unamend':
                                        this.amendingCommits.pop();
                                        if (this.amendingCommits.length === 0) {
                                            const storageKey = this.getStorageKey(repository);
                                            this.storageService.setData<string | undefined>(storageKey, undefined);
                                        }
                                        break;
                                }
                                this.lastCommit = nextCommit;
                                this.onNextFrame(() => {
                                    this.transition.state = 'transitioning';
                                    this.update();
                                });

                                setTimeout(
                                    () => {
                                        this.transition.state = 'none';
                                        this.update();
                                    },
                                    GitWidget.TRANSITION_TIME_MS);
                            } else {
                                // No previous last commit so no transition
                                this.transition.state = 'none';
                                this.lastCommit = nextCommit;
                            }
                        }

                        this.transitionHint = 'none';
                    }
                    this.status = gitEvent.status;
                    this.updateView(gitEvent.status);
                }
            }));
        } else {
            this.updateView(undefined);
        }
    }

    private async clearAmendingCommits(repository: Repository): Promise<void> {
        const storageKey = this.getStorageKey(repository);
        await this.storageService.setData<string | undefined>(storageKey, undefined);
    }

    private async buildAmendingList(repository: Repository): Promise<{ commit: CommitWithChanges, avatar: string }[]> {
        const storageKey = this.getStorageKey(repository);
        const amendingHeadCommitSha = await this.storageService.getData<string | undefined>(storageKey, undefined);

        // Restore list of commits from saved amending head commit up through parents until the
        // current commit.  (If we don't reach the current commit, the repository has been changed in such
        // a way then unamending commits can no longer be done).
        if (amendingHeadCommitSha) {
            const commits = await this.git.log(
                repository,
                {
                    range: { toRevision: amendingHeadCommitSha, fromRevision: this.lastHead },
                    maxCount: 50
                }
            );
            const amendingCommitPromises = commits.map(async commit => {
                const avatar = await this.avatarService.getAvatar(commit.author.email);
                return { commit, avatar };
            });
            return Promise.all(amendingCommitPromises);
        } else {
            return [];
        }
    }

    private getStorageKey(repository: Repository): string {
        return REPOSITORY_STORAGE_KEY + ':' + repository.localUri;
    }

    protected addGitListKeyListeners = (id: string) => this.doAddGitListKeyListeners(id);
    protected doAddGitListKeyListeners(id: string) {
        const container = document.getElementById(id);
        if (container) {
            this.addGitListNavigationKeyListeners(container);
            this.addKeyListener(container, Key.SPACE, this.stageOrUnstage);
            this.addKeyListener(container, Key.BACKSPACE, this.handleBackspace);
        }
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const messageInput = document.getElementById(GitWidget.Styles.COMMIT_MESSAGE) as HTMLInputElement;
        if (messageInput) {
            messageInput.focus();
        }
    }

    storeState(): object {
        const messageBoxHeight = this.messageBoxHeight ? this.messageBoxHeight : GitWidget.MESSAGE_BOX_MIN_HEIGHT;
        return {
            message: this.message,
            commitMessageValidationResult: this.commitMessageValidationResult,
            messageBoxHeight
        };
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        this.message = oldState.message;
        // Do not restore the validation message if the commit message is undefined or empty.
        this.commitMessageValidationResult = this.message ? oldState.commitMessageValidationResult : undefined;
        this.messageBoxHeight = oldState.messageBoxHeight || GitWidget.MESSAGE_BOX_MIN_HEIGHT;
    }

    protected stageOrUnstage = () => this.doStageOrUnstage();
    protected doStageOrUnstage(): void {
        const change = this.getSelected();
        if (change && this.repositoryProvider.selectedRepository) {
            this.setLastSelectedNode(change);
            const repository = this.repositoryProvider.selectedRepository;
            if (!change.staged) {
                this.stage(repository, change);
            } else {
                this.unstage(repository, change);
            }
        }
    }

    protected handleBackspace = () => this.doHandleBackspace();
    protected async doHandleBackspace() {
        const change = this.getSelected();
        if (change && this.repositoryProvider.selectedRepository) {
            this.setLastSelectedNode(change);
            await this.discard(this.repositoryProvider.selectedRepository, change);
        }
    }

    protected setLastSelectedNode(change: GitFileChangeNode) {
        this.lastSelectedNode = {
            id: this.indexOfSelected,
            node: change
        };
    }

    /**
     * This function will update the 'model' (lastCommit, amendingCommits) only
     * when the Git repository sees the last commit change.
     * 'render' can be called at any time, so be sure we don't update any 'model'
     * fields until we actually start the transition.
     */
    protected async amend(): Promise<void> {
        if (this.transition.state !== 'none' && this.transitionHint !== 'none') {
            return;
        }

        const { selectedRepository } = this.repositoryProvider;
        if (selectedRepository) {
            this.transitionHint = 'amend';
            await this.resetAndSetMessage(selectedRepository, 'HEAD~', 'HEAD');
        }
    }

    protected async unamend(): Promise<void> {
        if (this.transition.state !== 'none' && this.transitionHint !== 'none') {
            return;
        }

        const commitToRestore = (this.amendingCommits.length >= 1)
            ? this.amendingCommits[this.amendingCommits.length - 1]
            : undefined;
        const oldestAmendCommit = (this.amendingCommits.length >= 2)
            ? this.amendingCommits[this.amendingCommits.length - 2]
            : undefined;

        const { selectedRepository } = this.repositoryProvider;
        if (selectedRepository && commitToRestore) {
            const commitToUseForMessage = oldestAmendCommit
                ? oldestAmendCommit.commit.sha
                : undefined;
            this.transitionHint = 'unamend';
            await this.resetAndSetMessage(selectedRepository, commitToRestore.commit.sha, commitToUseForMessage);
        }
    }

    private async resetAndSetMessage(repository: Repository, commitToRestore: string, commitToUseForMessage: string | undefined): Promise<void> {
        const message = commitToUseForMessage
            ? (await this.git.exec(repository, ['log', '-n', '1', '--format=%B', commitToUseForMessage])).stdout.trim()
            : '';
        const commitTextArea = document.getElementById(GitWidget.Styles.COMMIT_MESSAGE) as HTMLTextAreaElement;
        await this.git.exec(repository, ['reset', commitToRestore, '--soft']);
        if (commitTextArea) {
            this.message = message;
            commitTextArea.value = message;
            this.resize(commitTextArea);
            commitTextArea.focus();
        }
    }

    async doCommit(repository?: Repository, options?: 'amend' | 'sign-off', message: string = this.message) {
        if (repository) {
            this.commitMessageValidationResult = undefined;
            if (message.trim().length === 0) {
                this.commitMessageValidationResult = {
                    status: 'error',
                    message: 'Please provide a commit message'
                };
            }
            if (this.commitMessageValidationResult === undefined && !(await this.git.status(repository)).changes.some(c => c.staged === true)) {
                this.commitMessageValidationResult = {
                    status: 'error',
                    message: 'No changes added to commit'
                };
            }
            if (this.commitMessageValidationResult === undefined) {
                try {
                    // We can make sure, repository exists, otherwise we would not have this button.
                    const signOff = options === 'sign-off';
                    const amend = options === 'amend';
                    await this.git.commit(repository, message, { signOff, amend });
                    const status = await this.git.status(repository);
                    this.resetCommitMessages();
                    this.updateView(status);
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            } else {
                const messageInput = document.getElementById(GitWidget.Styles.COMMIT_MESSAGE) as HTMLInputElement;
                if (messageInput) {
                    this.update();
                    messageInput.focus();
                }
            }
        }
    }

    protected async updateView(status: WorkingDirectoryStatus | undefined) {
        const stagedChanges = [];
        const unstagedChanges = [];
        const mergeChanges = [];
        if (status) {
            for (const change of status.changes) {
                const uri = new URI(change.uri);
                const repository = this.repositoryProvider.selectedRepository;
                const [icon, label, description] = await Promise.all([
                    this.labelProvider.getIcon(uri),
                    this.labelProvider.getName(uri),
                    repository ? Repository.relativePath(repository, uri.parent).toString() : this.labelProvider.getLongName(uri.parent)
                ]);
                if (GitFileStatus[GitFileStatus.Conflicted.valueOf()] !== GitFileStatus[change.status]) {
                    if (change.staged) {
                        stagedChanges.push({
                            icon, label, description,
                            ...change
                        });
                    } else {
                        unstagedChanges.push({
                            icon, label, description,
                            ...change
                        });
                    }
                } else {
                    if (!change.staged) {
                        mergeChanges.push({
                            icon, label, description,
                            ...change
                        });
                    }
                }
            }
            this.incomplete = status.incomplete;
        }
        const sort = (l: GitFileChangeNode, r: GitFileChangeNode) => l.label.localeCompare(r.label);
        this.stagedChanges = stagedChanges.sort(sort);
        this.unstagedChanges = unstagedChanges.sort(sort);
        this.mergeChanges = mergeChanges.sort(sort);
        this.gitNodes = [...this.mergeChanges, ...this.stagedChanges, ...this.unstagedChanges];
        this.setNodeSelection();
        this.update();
    }

    protected setNodeSelection(): void {
        if (this.lastSelectedNode) {
            let newId = this.lastSelectedNode.id;
            if (this.lastSelectedNode.node.staged) {
                newId -= 1;
                if (newId < 0) {
                    newId = 0;
                }
                this.gitNodes[newId].selected = true;
            } else {
                if (this.gitNodes[newId] && this.gitNodes[newId].staged && this.gitNodes[newId + 1]) {
                    newId += 1;
                } else if (!this.gitNodes[newId]) {
                    newId = this.gitNodes.length - 1;
                }
                this.gitNodes[newId].selected = true;
            }
            this.lastSelectedNode = undefined;
        }
    }

    protected renderCommitMessage(): React.ReactNode {
        const validationStatus = this.commitMessageValidationResult ? this.commitMessageValidationResult.status : 'idle';
        const validationMessage = this.commitMessageValidationResult ? this.commitMessageValidationResult.message : '';
        return <div className={GitWidget.Styles.COMMIT_MESSAGE_CONTAINER}>
            <textarea
                className={`${GitWidget.Styles.COMMIT_MESSAGE} theia-git-commit-message-${validationStatus}`}
                style={{ height: this.messageBoxHeight, overflow: this.messageBoxHeight > GitWidget.MESSAGE_BOX_MIN_HEIGHT ? 'auto' : 'hidden' }}
                autoFocus={true}
                onInput={this.onCommitMessageChange.bind(this)}
                placeholder='Commit message'
                id={GitWidget.Styles.COMMIT_MESSAGE}
                defaultValue={this.message}
                tabIndex={1}>
            </textarea>
            <div
                className={
                    `${GitWidget.Styles.VALIDATION_MESSAGE} ${GitWidget.Styles.NO_SELECT}
                    theia-git-validation-message-${validationStatus} theia-git-commit-message-${validationStatus}`
                }
                style={
                    {
                        display: !!this.commitMessageValidationResult ? 'block' : 'none'
                    }
                }>{validationMessage}</div>
        </div>;
    }

    protected onCommitMessageChange(e: Event): void {
        const { target } = e;
        if (target instanceof HTMLTextAreaElement) {
            const { value } = target;
            this.message = value;
            this.resize(target);
            this.validateCommitMessage(value).then(result => {
                if (!GitCommitMessageValidator.Result.equal(this.commitMessageValidationResult, result)) {
                    this.commitMessageValidationResult = result;
                    this.update();
                }
            });
        }
    }

    protected resize(textArea: HTMLTextAreaElement): void {
        // tslint:disable-next-line:no-null-keyword
        const fontSize = Number.parseInt(window.getComputedStyle(textArea, undefined).getPropertyValue('font-size').split('px')[0] || '0', 10);
        const { value } = textArea;
        if (Number.isInteger(fontSize) && fontSize > 0) {
            const requiredHeight = fontSize * value.split(/\r?\n/).length;
            if (requiredHeight < textArea.scrollHeight) {
                textArea.style.height = `${requiredHeight}px`;
            }
        }
        if (textArea.clientHeight < textArea.scrollHeight) {
            textArea.style.height = `${textArea.scrollHeight}px`;
            if (textArea.clientHeight < textArea.scrollHeight) {
                textArea.style.height = `${(textArea.scrollHeight * 2 - textArea.clientHeight)}px`;
            }
        }
        const updatedHeight = textArea.style.height;
        if (updatedHeight) {
            this.messageBoxHeight = parseInt(updatedHeight, 10) || GitWidget.MESSAGE_BOX_MIN_HEIGHT;
            if (this.messageBoxHeight > GitWidget.MESSAGE_BOX_MIN_HEIGHT) {
                textArea.style.overflow = 'auto';
            } else {
                // Hide the scroll-bar if we shrink down the size.
                textArea.style.overflow = 'hidden';
            }
        }
    }

    protected async validateCommitMessage(input: string | undefined): Promise<GitCommitMessageValidator.Result | undefined> {
        return this.commitMessageValidator.validate(input);
    }

    protected render(): React.ReactNode {
        const repository = this.repositoryProvider.selectedRepository;
        if (!repository) {
            return <AlertMessage
                type='WARNING'
                header='Version control is not available at this time'
            />;
        }
        return <div className={GitWidget.Styles.MAIN_CONTAINER}>
            <div className='headerContainer'>
                {this.renderCommitMessage()}
                {this.renderCommandBar(repository)}
            </div>
            {
                this.incomplete ?
                    <div className={`${GitWidget.Styles.MESSAGE_CONTAINER} ${GitWidget.Styles.WARNING_MESSAGE}`}>
                        There are too many active changes, only a subset is shown.</div>
                    : ''
            }
            <GitChangesListContainer
                ref={ref => this.listContainer = ref || undefined}
                id={this.scrollContainer}
                repository={repository}
                openChange={this.handleOpenChange}
                openFile={this.openFile}
                selectChange={this.selectChange}
                discard={this.discard}
                discardAll={this.discardAll}
                unstage={this.unstage}
                unstageAll={this.unstageAll}
                stage={this.stage}
                stageAll={this.stageAll}
                mergeChanges={this.mergeChanges}
                stagedChanges={this.stagedChanges}
                unstagedChanges={this.unstagedChanges}
                addGitListKeyListeners={this.addGitListKeyListeners}
                onFocus={this.handleListFocus}
            />
            {
                this.amendingCommits.length > 0 || (this.lastCommit && this.transition.state !== 'none' && this.transition.direction === 'down')
                    ? this.renderAmendingCommits()
                    : ''
            }
            {
                this.lastCommit ?
                    <div>
                        <div id='lastCommit' className='changesContainer'>
                            <div className='theia-header git-theia-header'>
                                HEAD Commit
                            </div>
                            {this.renderLastCommit()}
                        </div>
                    </div>
                    : ''
            }
        </div>;
    }

    protected readonly openFile = (uri: URI) => this.doOpenFile(uri);
    protected doOpenFile(uri: URI) {
        this.editorManager.open(uri, { mode: 'reveal' });
    }

    protected readonly handleListFocus = (e: React.FocusEvent) => this.doHandleListFocus(e);
    protected doHandleListFocus(e: React.FocusEvent) {
        const selected = this.getSelected();
        if (!selected && this.gitNodes.length > 0) {
            this.selectNode(this.gitNodes[0]);
        }
    }

    protected async getLastCommit(): Promise<{ commit: CommitWithChanges, avatar: string } | undefined> {
        const { selectedRepository } = this.repositoryProvider;
        if (selectedRepository) {
            const commits = await this.git.log(selectedRepository, { maxCount: 1, shortSha: true });
            if (commits.length > 0) {
                const commit = commits[0];
                const avatar = await this.avatarService.getAvatar(commit.author.email);
                return { commit, avatar };
            }
        }
        return undefined;
    }

    protected renderAmendingCommits(): React.ReactNode {
        const neverShrink = this.amendingCommits.length <= 3;

        const classNames = neverShrink
            ? 'amendedCommitsOuterContainer'
            : 'amendedCommitsOuterContainer withMinHeight';

        return <div id='amendedCommits' className={classNames}>
            <div className='theia-header git-theia-header'>
                <div className='noWrapInfo'>Commits being Amended</div>
                <div className='git-change-list-buttons-container'>
                    {this.renderAmendCommitListButtons()}
                    {this.renderCommitCount(this.amendingCommits.length)}
                </div>
            </div>
            <div style={this.styleAmendedCommits()}>
                {this.amendingCommits.map((commitData, index, array) =>
                    this.renderCommitBeingAmended(commitData, index === array.length - 1)
                )}
                {
                    this.lastCommit && this.transition.state !== 'none' && this.transition.direction === 'down'
                        ? this.renderCommitBeingAmended(this.lastCommit, false)
                        : ''
                }
            </div>
        </div>;
    }

    protected renderAmendCommitListButtons(): React.ReactNode {
        return <div className='buttons'>
            <a className='toolbar-button' title='Unamend All Commits' onClick={this.unamendAll.bind(this)}>
                <i className='fa fa-minus' />
            </a>
        </div>;
    }

    protected renderLastCommit(): React.ReactNode {
        if (!this.lastCommit) {
            return '';
        }

        return <div className={GitWidget.Styles.LAST_COMMIT_AND_BUTTON}>
            {this.renderLastCommitNoButton(this.lastCommit)}
            <div className={GitWidget.Styles.FLEX_CENTER}>
                <button className='theia-button' title='Amend last commit' onClick={() => this.amend.bind(this)()}>
                    Amend
                </button>
            </div>
        </div>;
    }

    protected renderLastCommitNoButton(lastCommit: { commit: CommitWithChanges, avatar: string }): React.ReactNode {
        switch (this.transition.state) {
            case 'none':
                return <div ref={this.lastCommitScrollRef} className='scolling-container'>
                    {this.renderCommitAvatarAndDetail(lastCommit)}
                </div>;

            case 'start':
            case 'transitioning':
                switch (this.transition.direction) {
                    case 'up':
                        return <div style={this.styleLastCommitMovingUp(this.transition.state)}>
                            {this.renderCommitAvatarAndDetail(this.transition.previousLastCommit)}
                            {this.renderCommitAvatarAndDetail(lastCommit)}
                        </div>;
                    case 'down':
                        return <div style={this.styleLastCommitMovingDown(this.transition.state)}>
                            {this.renderCommitAvatarAndDetail(lastCommit)}
                            {this.renderCommitAvatarAndDetail(this.transition.previousLastCommit)}
                        </div>;
                }
        }
    }

    /**
     * See https://stackoverflow.com/questions/26556436/react-after-render-code
     *
     * @param callback
     */
    protected onNextFrame(callback: FrameRequestCallback) {
        setTimeout(
            () => window.requestAnimationFrame(callback),
            0);
    }

    protected renderCommitAvatarAndDetail(commitData: { commit: CommitWithChanges, avatar: string }): React.ReactNode {
        const { commit, avatar } = commitData;
        return <div className={GitWidget.Styles.LAST_COMMIT_AVATAR_AND_TEXT} key={commit.sha}>
            <div className={GitWidget.Styles.LAST_COMMIT_MESSAGE_AVATAR}>
                <img src={avatar} />
            </div>
            <div className={GitWidget.Styles.LAST_COMMIT_DETAILS}>
                <div className={GitWidget.Styles.LAST_COMMIT_MESSAGE_SUMMARY}>{commit.summary}</div>
                <div className={GitWidget.Styles.LAST_COMMIT_MESSAGE_TIME}>{`${commit.authorDateRelative} by ${commit.author.name}`}</div>
            </div>
        </div>;
    }

    protected renderCommitCount(commits: number): React.ReactNode {
        return <div className='notification-count-container git-change-count'>
            <span className='notification-count'>{commits}</span>
        </div>;
    }

    protected renderCommitBeingAmended(commitData: { commit: CommitWithChanges, avatar: string }, isOldestAmendCommit: boolean) {
        if (isOldestAmendCommit && this.transition.state !== 'none' && this.transition.direction === 'up') {
            return <div className='theia-git-last-commit-avatar-and-text no-grow-or-shrink' key={commitData.commit.sha}>
                <div className='fixed-height-commit-container'>
                    {this.renderCommitAvatarAndDetail(commitData)}
                </div>
            </div>;
        } else {
            return <div className='theia-git-last-commit-avatar-and-text no-grow-or-shrink' key={commitData.commit.sha}>
                {this.renderCommitAvatarAndDetail(commitData)}
                {
                    isOldestAmendCommit
                        ? <div className={GitWidget.Styles.FLEX_CENTER}>
                            <button className='theia-button' title='Unamend commit' onClick={() => this.unamend.bind(this)()}>
                                Unamend
                        </button>
                        </div>
                        : ''
                }
            </div>;
        }
    }

    /*
     * The style for the <div> containing the list of commits being amended.
     * This div is scrollable.
     */
    protected styleAmendedCommits(): React.CSSProperties {
        const base = {
            display: 'flex',
            whitespace: 'nowrap',
            width: '100%',
            minHeight: 0,
            flexShrink: 1,
            paddingTop: '2px',
        };

        switch (this.transition.state) {
            case 'none':
                return {
                    ...base,
                    flexDirection: 'column',
                    overflowY: 'auto',
                    marginBottom: '0',
                };
            case 'start':
            case 'transitioning':
                let startingMargin: number = 0;
                let endingMargin: number = 0;
                switch (this.transition.direction) {
                    case 'down':
                        startingMargin = 0;
                        endingMargin = -32;
                        break;
                    case 'up':
                        startingMargin = -32;
                        endingMargin = 0;
                        break;
                }

                switch (this.transition.state) {
                    case 'start':
                        return {
                            ...base,
                            flexDirection: 'column',
                            overflowY: 'hidden',
                            marginBottom: `${startingMargin}px`,
                        };
                    case 'transitioning':
                        return {
                            ...base,
                            flexDirection: 'column',
                            overflowY: 'hidden',
                            marginBottom: `${endingMargin}px`,
                            transitionProperty: 'margin-bottom',
                            transitionDuration: `${GitWidget.TRANSITION_TIME_MS}ms`,
                            transitionTimingFunction: 'linear'
                        };
                }
        }

        throw new Error('Invalid value for transtition state: ' + this.transition.state);
    }

    protected styleLastCommitMovingUp(transitionState: 'start' | 'transitioning'): React.CSSProperties {
        return this.styleLastCommit(transitionState, 0, -28);
    }

    protected styleLastCommitMovingDown(transitionState: 'start' | 'transitioning'): React.CSSProperties {
        return this.styleLastCommit(transitionState, -28, 0);
    }

    protected styleLastCommit(transitionState: 'start' | 'transitioning', startingMarginTop: number, startingMarginBottom: number): React.CSSProperties {
        const base = {
            display: 'flex',
            width: '100%',
            overflow: 'hidden',
            paddingTop: 0,
            paddingBottom: 0,
            borderTop: 0,
            borderBottom: 0,
            height: this.lastCommitHeight * 2
        };

        // We end with top and bottom margins switched
        const endingMarginTop = startingMarginBottom;
        const endingMarginBottom = startingMarginTop;

        switch (transitionState) {
            case 'start':
                return {
                    ...base,
                    position: 'relative',
                    flexDirection: 'column',
                    marginTop: startingMarginTop,
                    marginBottom: startingMarginBottom,
                };
            case 'transitioning':
                return {
                    ...base,
                    position: 'relative',
                    flexDirection: 'column',
                    marginTop: endingMarginTop,
                    marginBottom: endingMarginBottom,
                    transitionProperty: 'margin-top margin-bottom',
                    transitionDuration: `${GitWidget.TRANSITION_TIME_MS}ms`,
                    transitionTimingFunction: 'linear'
                };
        }
    }

    protected readonly refresh = () => this.doRefresh();
    protected async doRefresh() {
        await this.repositoryProvider.refresh();
    }

    protected readonly showMoreToolButtons = (event: React.MouseEvent<HTMLElement>) => this.doShowMoreToolButtons(event);
    protected doShowMoreToolButtons(event: React.MouseEvent<HTMLElement>) {
        const el = (event.target as HTMLElement).parentElement;
        if (el) {
            this.contextMenuRenderer.render(GitWidget.ContextMenu.PATH, {
                x: el.getBoundingClientRect().left,
                y: el.getBoundingClientRect().top + el.offsetHeight
            });
        }
    }

    protected readonly signOff = () => this.doSignOff();
    protected async doSignOff() {
        const { selectedRepository } = this.repositoryProvider;
        if (selectedRepository) {
            const [username, email] = await this.getUserConfig(selectedRepository);
            const signOff = `\n\nSigned-off-by: ${username} <${email}>`;
            const commitTextArea = document.getElementById(GitWidget.Styles.COMMIT_MESSAGE) as HTMLTextAreaElement;
            if (commitTextArea) {
                const content = commitTextArea.value;
                if (content.endsWith(signOff)) {
                    commitTextArea.value = content.substr(0, content.length - signOff.length);
                } else {
                    commitTextArea.value = `${content}${signOff}`;
                }
                this.resize(commitTextArea);
                this.message = commitTextArea.value;
                commitTextArea.focus();
            }
        }
    }

    protected readonly commit = (repository: Repository | undefined) => this.doCommit.bind(this)(repository);

    protected renderCommandBar(repository: Repository | undefined): React.ReactNode {
        return <div id='commandBar' className='flexcontainer'>
            <div className='buttons'>
                <a className='toolbar-button' title='Refresh' onClick={this.refresh}>
                    <i className='fa fa-refresh' />
                </a>
                {
                    repository ?
                        <React.Fragment>
                            <a className='toolbar-button' title='Add Signed-off-by' onClick={this.signOff}>
                                <i className='fa fa-pencil-square-o ' />
                            </a >
                            <a className='toolbar-button' title='More...' onClick={this.showMoreToolButtons}>
                                <i className='fa fa-ellipsis-h' />
                            </a >
                        </React.Fragment>
                        : ''
                }
            </div >
            <div className='placeholder'></div >
            <div className='buttons'>
                <button className='theia-button' title='Commit all the staged changes' onClick={() => this.commit(repository)}>
                    Commit
            </button >
            </div>
        </div>;
    }

    protected async getUserConfig(repository: Repository): Promise<[string, string]> {
        const [username, email] = (await Promise.all([
            this.git.exec(repository, ['config', 'user.name']),
            this.git.exec(repository, ['config', 'user.email'])
        ])).map(result => result.stdout.trim());
        return [username, email];
    }

    readonly unstageAll = () => this.doUnstageAll();
    protected async doUnstageAll() {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            this.unstage(repository, this.stagedChanges);
            this.update();
        }
    }
    protected readonly unstage = (repository: Repository, change: GitFileChange | GitFileChange[]) => this.doUnstage(repository, change);
    protected async doUnstage(repository: Repository, change: GitFileChange | GitFileChange[]) {
        try {
            if (Array.isArray(change)) {
                const uris = change.map(c => c.uri);
                await this.git.unstage(repository, uris);
            } else {
                await this.git.unstage(repository, change.uri);
            }
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }

    readonly discardAll = () => this.doDiscardAll();
    protected async doDiscardAll() {
        if (await this.confirmAll()) {
            try {
                const repository = this.repositoryProvider.selectedRepository;
                if (repository) {
                    // discard new files
                    const newUris = this.unstagedChanges.filter(c => c.status === GitFileStatus.New).map(c => c.uri);
                    this.deleteAll(newUris);
                    // unstage changes
                    const uris = this.unstagedChanges.map(c => c.uri);
                    await this.git.unstage(repository, uris, { treeish: 'HEAD', reset: 'working-tree' });
                    this.update();
                }
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        }
    }
    protected readonly discard = (repository: Repository, change: GitFileChange) => this.doDiscard(repository, change);
    protected async doDiscard(repository: Repository, change: GitFileChange) {
        // Allow deletion, only iff the same file is not yet in the Git index.
        if (await this.git.lsFiles(repository, change.uri, { errorUnmatch: true })) {
            if (await this.confirm(change.uri)) {
                try {
                    await this.git.unstage(repository, change.uri, { treeish: 'HEAD', reset: 'working-tree' });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            }
        } else {
            await this.commandService.executeCommand(WorkspaceCommands.FILE_DELETE.id, new URI(change.uri));
        }
        if (this.listContainer) {
            this.listContainer.focus();
        }
    }

    readonly unamendAll = () => this.doUnamendAll();
    protected async doUnamendAll() {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            while (this.amendingCommits.length > 0) {
                this.unamend();
                await new Promise(resolve => setTimeout(resolve, GitWidget.TRANSITION_TIME_MS));
            }
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

    readonly stageAll = () => this.doStageAll();
    protected async doStageAll() {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            this.stage(repository, this.unstagedChanges);
            this.update();
        }
    }
    protected readonly stage = (repository: Repository, change: GitFileChange | GitFileChange[]) => this.doStage(repository, change);
    protected async doStage(repository: Repository, change: GitFileChange | GitFileChange[]) {
        try {
            if (Array.isArray(change)) {
                const uris = change.map(c => c.uri);
                await this.git.add(repository, uris);
            } else {
                await this.git.add(repository, change.uri);
            }
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
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

    handleOpenChange = async (change: GitFileChange, options?: EditorOpenerOptions) => this.openChange(change, options);

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

    protected resetCommitMessages(): void {
        this.message = '';
        const messageInput = document.getElementById(GitWidget.Styles.COMMIT_MESSAGE) as HTMLTextAreaElement;
        messageInput.value = '';
        this.resize(messageInput);
    }

    protected async delete(uri: URI): Promise<void> {
        try {
            return this.fileSystem.delete(uri.toString());
        } catch (e) {
            console.error(e);
        }
    }

    protected async deleteAll(uris: string[]): Promise<void> {
        await Promise.all(uris.map(uri => this.delete(new URI(uri))));
        this.update();
    }
}

export namespace GitWidget {

    export namespace ContextMenu {
        export const PATH: MenuPath = ['git-widget-context-menu'];
        export const OTHER_GROUP: MenuPath = [...PATH, '1_other'];
        export const COMMIT_GROUP: MenuPath = [...PATH, '2_commit'];
        export const BATCH: MenuPath = [...PATH, '3_batch'];
        export const STASH: MenuPath = [...PATH, '4_stash'];
    }

    export namespace Styles {
        export const MAIN_CONTAINER = 'theia-git-main-container';
        export const CHANGES_CONTAINER = 'changesOuterContainer';
        export const AMENDED_COMMITS_CONTAINER = 'amendedCommitsOuterContainer';
        export const COMMIT_MESSAGE_CONTAINER = 'theia-git-commit-message-container';
        export const COMMIT_MESSAGE = 'theia-git-commit-message';
        export const MESSAGE_CONTAINER = 'theia-git-message';
        export const WARNING_MESSAGE = 'theia-git-message-warning';
        export const VALIDATION_MESSAGE = 'theia-git-commit-validation-message';
        export const LAST_COMMIT_CONTAINER = 'theia-git-last-commit-container';
        export const LAST_COMMIT_AND_BUTTON = 'theia-git-last-commit-and-button';
        export const LAST_COMMIT_AVATAR_AND_TEXT = 'theia-git-last-commit-avatar-and-text';
        export const LAST_COMMIT_DETAILS = 'theia-git-last-commit-details';
        export const LAST_COMMIT_MESSAGE_AVATAR = 'theia-git-last-commit-message-avatar';
        export const LAST_COMMIT_MESSAGE_SUMMARY = 'theia-git-last-commit-message-summary';
        export const LAST_COMMIT_MESSAGE_TIME = 'theia-git-last-commit-message-time';

        export const FLEX_CENTER = 'flex-container-center';
        export const NO_SELECT = 'no-select';
    }

}

export namespace GitItem {
    export interface Props {
        change: GitFileChangeNode
        repository: Repository
        openChange: (change: GitFileChange, options?: EditorOpenerOptions) => Promise<EditorWidget | undefined>
        selectChange: (change: GitFileChange) => void
        unstage: (repository: Repository, change: GitFileChange) => void
        stage: (repository: Repository, change: GitFileChange) => void
        discard: (repository: Repository, change: GitFileChange) => void
        openFile: (uri: URI) => void
    }
}

export class GitItem extends React.Component<GitItem.Props> {

    protected readonly openChange = () => this.props.openChange(this.props.change, { mode: 'reveal' });
    protected readonly selectChange = () => this.props.selectChange(this.props.change);
    protected readonly doGitAction = (action: 'stage' | 'unstage' | 'discard') => this.props[action](this.props.repository, this.props.change);
    protected readonly doOpenFile = () => this.props.openFile(new URI(this.props.change.uri));

    render() {
        const { change } = this.props;
        return <div className={`gitItem ${GitWidget.Styles.NO_SELECT}${change.selected ? ' ' + SELECTED_CLASS : ''}`}>
            <div className='noWrapInfo' onDoubleClick={this.openChange} onClick={this.selectChange}>
                <span className={change.icon + ' file-icon'}></span>
                <span className='name'>{change.label + ' '}</span>
                <span className='path'>{change.description}</span>
            </div>
            <div className='itemButtonsContainer'>
                {this.renderGitItemButtons()}
                <div title={GitFileStatus.toString(change.status, change.staged)}
                    className={`status ${change.staged ? 'staged ' : ''} ${GitFileStatus[change.status].toLowerCase()}`}>
                    {GitFileStatus.toAbbreviation(change.status, change.staged)}
                </div>
            </div>
        </div>;
    }

    protected renderGitItemButtons(): React.ReactNode {
        return <div className='buttons'>
            <a className='toolbar-button' title='Open File' onClick={() => this.doOpenFile()}>
                <i className='open-file' />
            </a>
            {
                this.props.change.staged ?
                    <a className='toolbar-button' title='Unstage Changes' onClick={() => this.doGitAction('unstage')}>
                        <i className='fa fa-minus' />
                    </a> :
                    <React.Fragment>
                        <a className='toolbar-button' title='Discard Changes' onClick={() => this.doGitAction('discard')}>
                            <i className='fa fa-undo' />
                        </a>
                        <a className='toolbar-button' title='Stage Changes' onClick={() => this.doGitAction('stage')}>
                            <i className='fa fa-plus' />
                        </a>
                    </React.Fragment>
            }
        </div>;
    }
}

export namespace GitChangesListContainer {
    export interface Props {
        id: string
        repository: Repository | undefined
        openChange: (change: GitFileChange, options?: EditorOpenerOptions) => Promise<EditorWidget | undefined>
        selectChange: (change: GitFileChange) => void
        unstage: (repository: Repository, change: GitFileChange) => void
        unstageAll: (repository: Repository, change: GitFileChange[]) => void
        stage: (repository: Repository, change: GitFileChange) => void
        stageAll: (repository: Repository, change: GitFileChange[]) => void
        discard: (repository: Repository, change: GitFileChange) => void
        discardAll: () => void
        openFile: (uri: URI) => void
        mergeChanges: GitFileChangeNode[]
        stagedChanges: GitFileChangeNode[]
        unstagedChanges: GitFileChangeNode[]
        addGitListKeyListeners: (id: string) => void
        onFocus: (e: React.FocusEvent) => void
    }
}

export class GitChangesListContainer extends React.Component<GitChangesListContainer.Props> {
    protected listContainer: HTMLDivElement | undefined;

    protected readonly doStageAll = () => this.props.stageAll(this.props.repository!, this.props.unstagedChanges);
    protected readonly doUnstageAll = () => this.props.unstageAll(this.props.repository!, this.props.stagedChanges);
    protected readonly doDiscardAll = () => this.props.discardAll();

    render() {
        return (
            <div
                ref={ref => this.listContainer = ref || undefined}
                className={GitWidget.Styles.CHANGES_CONTAINER}
                id={this.props.id}
                onFocus={this.handleOnFocus}
                tabIndex={2}>
                {this.renderMergeChanges(this.props.repository) || ''}
                {this.renderStagedChanges(this.props.repository) || ''}
                {this.renderUnstagedChanges(this.props.repository) || ''}
            </div>
        );
    }

    componentDidMount() {
        this.props.addGitListKeyListeners(this.props.id);
    }

    focus() {
        if (this.listContainer) {
            this.listContainer.focus();
        }
    }

    protected handleOnFocus = (e: React.FocusEvent) => {
        this.props.onFocus(e);
    }

    protected renderGitItem(change: GitFileChangeNode, repository?: Repository): React.ReactNode {
        if (!repository) {
            return '';
        }
        return <GitItem key={change.uri + change.status}
            repository={repository}
            change={change}
            openChange={this.props.openChange}
            discard={this.props.discard}
            stage={this.props.stage}
            unstage={this.props.unstage}
            selectChange={this.props.selectChange}
            openFile={this.props.openFile}
        />;
    }

    protected renderMergeChanges(repository: Repository | undefined): React.ReactNode | undefined {
        if (this.props.mergeChanges.length > 0) {
            return <div id='mergeChanges' className='changesContainer'>
                <div className='theia-header git-theia-header'>
                    <div className='noWrapInfo'>Merged Changes</div>
                    <div className='git-change-list-buttons-container'>
                        {this.renderChangeListButtons([GitBatchAction.STAGE_ALL])}
                        {this.renderChangeCount(this.props.mergeChanges.length)}
                    </div>
                </div>
                {this.props.mergeChanges.map(change => this.renderGitItem(change, repository))}
            </div>;
        } else {
            return undefined;
        }
    }

    protected renderStagedChanges(repository: Repository | undefined): React.ReactNode | undefined {
        if (this.props.stagedChanges.length > 0) {
            return <div id='stagedChanges' className='changesContainer'>
                <div className='theia-header git-theia-header'>
                    <div className='noWrapInfo'>Staged Changes</div>
                    <div className='git-change-list-buttons-container'>
                        {this.renderChangeListButtons([GitBatchAction.UNSTAGE_ALL])}
                        {this.renderChangeCount(this.props.stagedChanges.length)}
                    </div>
                </div>
                {this.props.stagedChanges.map(change => this.renderGitItem(change, repository))}
            </div>;
        } else {
            return undefined;
        }
    }

    protected renderUnstagedChanges(repository: Repository | undefined): React.ReactNode | undefined {
        if (this.props.unstagedChanges.length > 0) {
            return <div id='unstagedChanges' className='changesContainer'>
                <div className='theia-header git-theia-header'>
                    <div className='noWrapInfo'>Changes</div>
                    <div className='git-change-list-buttons-container'>
                        {this.renderChangeListButtons([GitBatchAction.STAGE_ALL, GitBatchAction.DISCARD_ALL])}
                        {this.renderChangeCount(this.props.unstagedChanges.length)}
                    </div>
                </div>
                {this.props.unstagedChanges.map(change => this.renderGitItem(change, repository))}
            </div>;
        }
        return undefined;
    }

    protected renderChangeCount(changes: number): React.ReactNode {
        return <div className='notification-count-container'>
            <span className='notification-count'>{changes}</span>
        </div>;
    }

    protected renderChangeListButtons(actions: GitBatchAction[]): React.ReactNode {
        const stageAll = (actions.some(a => a === GitBatchAction.STAGE_ALL))
            ? <a className='toolbar-button' title='Stage All Changes' onClick={this.doStageAll}><i className='fa fa-plus' /></a> : '';
        const unstageAll = (actions.some(a => a === GitBatchAction.UNSTAGE_ALL))
            ? <a className='toolbar-button' title='Unstage All Changes' onClick={this.doUnstageAll}><i className='fa fa-minus' /></a> : '';
        const discardAll = (actions.some(a => a === GitBatchAction.DISCARD_ALL))
            ? <a className='toolbar-button' title='Discard All Changes' onClick={this.doDiscardAll}><i className='fa fa-undo' /></a> : '';
        return <div className='buttons'>{discardAll}{unstageAll}{stageAll}</div>;
    }
}

export enum GitBatchAction {
    /** Stage All Changes Command */
    STAGE_ALL,
    /** Unstage All Changes Command */
    UNSTAGE_ALL,
    /** Discard All Changes Command */
    DISCARD_ALL
}
