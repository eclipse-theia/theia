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
import { ContextMenuRenderer, LabelProvider, DiffUris, StatefulWidget, Message } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget, EditorOpenerOptions } from '@theia/editor/lib/browser';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { Git, GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus, CommitWithChanges } from '../common';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitCommitMessageValidator } from './git-commit-message-validator';
import { GitAvatarService } from './history/git-avatar-service';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';
import { GitErrorHandler } from './git-error-handler';

export interface GitFileChangeNode extends GitFileChange {
    readonly icon: string;
    readonly label: string;
    readonly description: string;
    readonly caption?: string;
    readonly extraIconClassName?: string;
    readonly commitSha?: string;
    selected?: boolean;
}
export namespace GitFileChangeNode {
    export function is(node: Object | undefined): node is GitFileChangeNode {
        return !!node && 'uri' in node && 'status' in node && 'description' in node && 'label' in node && 'icon' in node;
    }
}

@injectable()
export class GitWidget extends ReactWidget implements StatefulWidget {

    private static MESSAGE_BOX_MIN_HEIGHT = 25;

    protected stagedChanges: GitFileChangeNode[] = [];
    protected unstagedChanges: GitFileChangeNode[] = [];
    protected mergeChanges: GitFileChangeNode[] = [];
    protected incomplete?: boolean;
    protected message: string = '';
    protected messageBoxHeight: number = GitWidget.MESSAGE_BOX_MIN_HEIGHT;
    protected status: WorkingDirectoryStatus | undefined;
    protected scrollContainer: string;
    protected commitMessageValidationResult: GitCommitMessageValidator.Result | undefined;
    protected lastCommit: { commit: CommitWithChanges, avatar: string } | undefined;
    protected lastHead: string | undefined;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(GitErrorHandler)
    protected readonly gitErrorHandler: GitErrorHandler;

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
        this.title.iconClass = 'fa git-tab-icon';
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
        this.update();
    }

    async initialize(repository: Repository | undefined): Promise<void> {
        if (repository) {
            this.toDispose.dispose();
            this.toDispose.push(await this.gitWatcher.watchGitChanges(repository));
            this.toDispose.push(this.gitWatcher.onGitEvent(async gitEvent => {
                if (GitStatusChangeEvent.is(gitEvent)) {
                    if (gitEvent.status.currentHead !== this.lastHead) {
                        this.lastHead = gitEvent.status.currentHead;
                        this.lastCommit = gitEvent.status.currentHead ? await this.getLastCommit() : undefined;
                    }
                    this.status = gitEvent.status;
                    this.updateView(gitEvent.status);
                }
            }));
        }
    }

    onActivateRequest(msg: Message): void {
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

    protected async amend(): Promise<void> {
        const { selectedRepository } = this.repositoryProvider;
        if (selectedRepository) {
            const message = (await this.git.exec(selectedRepository, ['log', '-n', '1', '--format=%B'])).stdout.trim();
            const commitTextArea = document.getElementById(GitWidget.Styles.COMMIT_MESSAGE) as HTMLTextAreaElement;
            await this.git.exec(selectedRepository, ['reset', 'HEAD~', '--soft']);
            if (commitTextArea) {
                this.message = message;
                commitTextArea.value = message;
                this.resize(commitTextArea);
                commitTextArea.focus();
            }
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
        this.update();
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
                defaultValue={this.message}>
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
            <div className={GitWidget.Styles.CHANGES_CONTAINER} id={this.scrollContainer}>
                {this.renderMergeChanges(repository) || ''}
                {this.renderStagedChanges(repository) || ''}
                {this.renderUnstagedChanges(repository) || ''}
            </div>
            {
                this.lastCommit ?
                    <div>
                        <div className={GitWidget.Styles.LAST_COMMIT_CONTAINER}>
                            {this.renderLastCommit()}
                        </div>
                    </div>
                    : ''
            }
        </div>;
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

    protected renderLastCommit(): React.ReactNode {
        if (!this.lastCommit) {
            return '';
        }
        const { commit, avatar } = this.lastCommit;
        return <React.Fragment>
            <div className={GitWidget.Styles.LAST_COMMIT_MESSAGE_AVATAR}>
                <img src={avatar} />
            </div>
            <div className={GitWidget.Styles.LAST_COMMIT_DETAILS}>
                <div className={GitWidget.Styles.LAST_COMMIT_MESSAGE_SUMMARY}>{commit.summary}</div>
                <div className={GitWidget.Styles.LAST_COMMIT_MESSAGE_TIME}>{`${commit.authorDateRelative} by ${commit.author.name}`}</div>
            </div>
            <div className={GitWidget.Styles.FLEX_CENTER}>
                <button className='theia-button' title='Amend last commit' onClick={() => this.amend.bind(this)()}>
                    Amend
            </button>
            </div>
        </React.Fragment>;
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

    protected readonly unstage = (repository: Repository, change: GitFileChange) => {
        this.doUnstage(repository, change);
    }
    protected async doUnstage(repository: Repository, change: GitFileChange) {
        try {
            await this.git.unstage(repository, change.uri);
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }

    protected readonly discard = (repository: Repository, change: GitFileChange) => {
        this.doDiscard(repository, change);
    }
    protected async doDiscard(repository: Repository, change: GitFileChange) {
        // Allow deletion, only iff the same file is not yet in the Git index.
        if (await this.git.lsFiles(repository, change.uri, { errorUnmatch: true })) {
            try {
                await this.git.unstage(repository, change.uri, { treeish: 'HEAD', reset: 'working-tree' });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        } else {
            this.commandService.executeCommand(WorkspaceCommands.FILE_DELETE.id, new URI(change.uri));
        }
    }

    protected readonly stage = (repository: Repository, change: GitFileChange) => {
        this.doStage(repository, change);
    }
    protected async doStage(repository: Repository, change: GitFileChange) {
        try {
            await this.git.add(repository, change.uri);
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }

    protected renderGitItemButtons(repository: Repository, change: GitFileChange): React.ReactNode {
        return <div className='buttons'>
            {
                change.staged ?
                    <a className='toolbar-button' title='Unstage Changes' onClick={() => this.unstage(repository, change)}>
                        <i className='fa fa-minus' />
                    </a> :
                    <React.Fragment>
                        <a className='toolbar-button' title='Discard Changes' onClick={() => this.discard(repository, change)}>
                            <i className='fa fa-undo' />
                        </a>
                        <a className='toolbar-button' title='Stage Changes' onClick={() => this.stage(repository, change)}>
                            <i className='fa fa-plus' />
                        </a>
                    </React.Fragment>
            }
        </div>;
    }

    protected renderGitItem(repository: Repository | undefined, change: GitFileChangeNode): React.ReactNode {
        if (!repository) {
            return '';
        }
        return <div className='gitItem noselect' key={change.uri + change.status}>
            <div className='noWrapInfo' onClick={() => this.openChange(change)}>
                <span className={change.icon + ' file-icon'}></span>
                <span className='name'>{change.label + ' '}</span>
                <span className='path'>{change.description}</span>
            </div>
            <div className='itemButtonsContainer'>
                <div className='buttons'>
                    {
                        change.staged ?
                            <a className='toolbar-button' title='Unstage Changes' onClick={() => this.unstage(repository, change)}>
                                <i className='fa fa-minus' />
                            </a> :
                            <React.Fragment>
                                <a className='toolbar-button' title='Discard Changes' onClick={() => this.discard(repository, change)}>
                                    <i className='fa fa-undo' />
                                </a>
                                <a className='toolbar-button' title='Stage Changes' onClick={() => this.stage(repository, change)}>
                                    <i className='fa fa-plus' />
                                </a>
                            </React.Fragment>
                    }
                </div>
                <div title={GitFileStatus.toString(change.status, change.staged)}
                    className={`status ${change.staged ? 'staged ' : ''} ${GitFileStatus[change.status].toLowerCase()}`}>
                    {GitFileStatus.toAbbreviation(change.status, change.staged)}
                </div>
            </div>
        </div>;
    }

    protected renderMergeChanges(repository: Repository | undefined): React.ReactNode | undefined {
        if (this.mergeChanges.length > 0) {
            return <div id='mergeChanges' className='changesContainer'>
                <div className='theia-header'>Merge Changes</div>
                {this.mergeChanges.map(change => this.renderGitItem(repository, change))}
            </div>;
        } else {
            return undefined;
        }
    }

    protected renderStagedChanges(repository: Repository | undefined): React.ReactNode | undefined {
        if (this.stagedChanges.length > 0) {
            return <div id='stagedChanges' className='changesContainer'>
                <div className='theia-header'>
                    Staged Changes
            </div>
                {this.stagedChanges.map(change => this.renderGitItem(repository, change))}
            </div>;
        } else {
            return undefined;
        }
    }

    protected renderUnstagedChanges(repository: Repository | undefined): React.ReactNode | undefined {
        if (this.unstagedChanges.length > 0) {
            return <div id='unstagedChanges' className='changesContainer'>
                <div className='theia-header'>Changes</div>
                {this.unstagedChanges.map(change => this.renderGitItem(repository, change))}
            </div>;
        }

        return undefined;
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

    async openChange(change: GitFileChange, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        const changeUri = this.createChangeUri(change);
        return this.editorManager.open(changeUri, options);
    }

    protected createChangeUri(change: GitFileChange): URI {
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
}

export namespace GitWidget {

    export namespace ContextMenu {
        export const PATH: MenuPath = ['git-widget-context-menu'];
        export const OTHER_GROUP: MenuPath = [...PATH, '1_other'];
        export const COMMIT_GROUP: MenuPath = [...PATH, '2_commit'];
    }

    export namespace Styles {
        export const MAIN_CONTAINER = 'theia-git-main-container';
        export const CHANGES_CONTAINER = 'changesOuterContainer';
        export const COMMIT_MESSAGE_CONTAINER = 'theia-git-commit-message-container';
        export const COMMIT_MESSAGE = 'theia-git-commit-message';
        export const MESSAGE_CONTAINER = 'theia-git-message';
        export const WARNING_MESSAGE = 'theia-git-message-warning';
        export const VALIDATION_MESSAGE = 'theia-git-commit-validation-message';
        export const LAST_COMMIT_CONTAINER = 'theia-git-last-commit-container';
        export const LAST_COMMIT_DETAILS = 'theia-git-last-commit-details';
        export const LAST_COMMIT_MESSAGE_AVATAR = 'theia-git-last-commit-message-avatar';
        export const LAST_COMMIT_MESSAGE_SUMMARY = 'theia-git-last-commit-message-summary';
        export const LAST_COMMIT_MESSAGE_TIME = 'theia-git-last-commit-message-time';

        export const FLEX_CENTER = 'flex-container-center';
        export const NO_SELECT = 'no-select';
    }

}
