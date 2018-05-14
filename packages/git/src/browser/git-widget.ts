/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from 'inversify';
import { h } from '@phosphor/virtualdom';
import URI from '@theia/core/lib/common/uri';
import { MessageService, ResourceProvider, CommandService, MenuPath } from '@theia/core';
import { VirtualRenderer, ContextMenuRenderer, VirtualWidget, LabelProvider, DiffUris } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget, EditorOpenerOptions } from '@theia/editor/lib/browser';
import { WorkspaceService, WorkspaceCommands } from '@theia/workspace/lib/browser';
import { Git, GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus, CommitWithChanges } from '../common';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitCommitMessageValidator } from './git-commit-message-validator';
import { GitAvatarService } from './history/git-avatar-service';

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
export class GitWidget extends VirtualWidget {

    protected stagedChanges: GitFileChangeNode[] = [];
    protected unstagedChanges: GitFileChangeNode[] = [];
    protected mergeChanges: GitFileChangeNode[] = [];
    protected message: string = '';
    protected status: WorkingDirectoryStatus | undefined;
    protected scrollContainer: string;
    protected commitMessageValidationResult: GitCommitMessageValidator.Result | undefined;
    protected lastCommit: { commit: CommitWithChanges, avatar: string } | undefined;
    protected lastHead: string | undefined;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(GitAvatarService) protected readonly avatarService: GitAvatarService,
        @inject(GitCommitMessageValidator) protected readonly commitMessageValidator: GitCommitMessageValidator) {

        super();
        this.id = 'theia-gitContainer';
        this.title.label = 'Git';
        this.scrollContainer = 'changesOuterContainer';
        this.addClass('theia-git');
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
                        this.lastCommit = await this.getLastCommit();
                    }
                    this.status = gitEvent.status;
                    this.updateView(gitEvent.status);
                }
            }));
        }
    }

    protected async undo(): Promise<void> {
        const { selectedRepository } = this.repositoryProvider;
        if (selectedRepository) {
            const message = (await this.git.exec(selectedRepository, ['log', '-n', '1', '--format=%B'])).stdout.trim();
            const commitTextArea = document.getElementById('theia-git-commit-message') as HTMLTextAreaElement;
            await this.git.exec(selectedRepository, ['reset', 'HEAD~', '--soft']);
            if (commitTextArea) {
                this.message = message;
                commitTextArea.value = message;
                this.resize(commitTextArea);
                commitTextArea.focus();
            }
        }
    }

    async commit(repository?: Repository, options?: 'amend' | 'sign-off', message: string = this.message) {
        if (repository) {
            if (message.trim().length > 0) {
                try {
                    // We can make sure, repository exists, otherwise we would not have this button.
                    const signOff = options === 'sign-off';
                    const amend = options === 'amend';
                    await this.git.commit(repository, message, { signOff, amend });
                    const status = await this.git.status(repository);
                    this.resetCommitMessages();
                    this.updateView(status);
                } catch (error) {
                    this.logError(error);
                }
            } else {
                // need to access the element, because Phosphor.js is not updating `value`but only `setAttribute('value', ....)` which only sets the default value.
                const messageInput = document.getElementById('theia-git-commit-message') as HTMLInputElement;
                if (messageInput) {
                    this.update();
                    messageInput.focus();
                }
                this.commitMessageValidationResult = {
                    status: 'error',
                    message: 'Please provide a commit message'
                };
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
        }
        const sort = (l: GitFileChangeNode, r: GitFileChangeNode) => l.label.localeCompare(r.label);
        this.stagedChanges = stagedChanges.sort(sort);
        this.unstagedChanges = unstagedChanges.sort(sort);
        this.mergeChanges = mergeChanges.sort(sort);
        this.update();
    }

    protected renderCommitMessage(): h.Child {
        const oninput = this.onCommitMessageChange.bind(this);
        const placeholder = 'Commit message';
        const status = this.commitMessageValidationResult ? this.commitMessageValidationResult.status : 'idle';
        const message = this.commitMessageValidationResult ? this.commitMessageValidationResult.message : '';
        const autofocus = 'true';
        const id = GitWidget.Styles.COMMIT_MESSAGE;
        const commitMessageArea = h.textarea({
            className: `${GitWidget.Styles.COMMIT_MESSAGE} theia-git-commit-message-${status}`,
            autofocus,
            oninput,
            placeholder,
            id
        });
        const validationMessageArea = h.div({
            className: `${GitWidget.Styles.VALIDATION_MESSAGE} ${GitWidget.Styles.NO_SELECT} theia-git-validation-message-${status} theia-git-commit-message-${status}`,
            style: {
                display: !!this.commitMessageValidationResult ? 'block' : 'none'
            },
            readonly: 'true'
        }, message);
        return h.div({ className: GitWidget.Styles.COMMIT_MESSAGE_CONTAINER }, commitMessageArea, validationMessageArea);
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
    }

    protected async validateCommitMessage(input: string | undefined): Promise<GitCommitMessageValidator.Result | undefined> {
        return this.commitMessageValidator.validate(input);
    }

    protected render(): h.Child {
        const repository = this.repositoryProvider.selectedRepository;

        const messageInput = this.renderCommitMessage();
        const commandBar = this.renderCommandBar(repository);
        const headerContainer = h.div({ className: 'headerContainer' }, messageInput, commandBar);

        const mergeChanges = this.renderMergeChanges(repository) || '';
        const stagedChanges = this.renderStagedChanges(repository) || '';
        const unstagedChanges = this.renderUnstagedChanges(repository) || '';
        const changesContainer = h.div({ className: "changesOuterContainer", id: this.scrollContainer }, mergeChanges, stagedChanges, unstagedChanges);

        const lastCommit = this.lastCommit ? h.div(h.div({ className: GitWidget.Styles.LAST_COMMIT_CONTAINER }, this.renderLastCommit())) : '';

        return [headerContainer, changesContainer, lastCommit];
    }

    protected createChildContainer(): HTMLElement {
        const container = super.createChildContainer();
        container.classList.add(GitWidget.Styles.MAIN_CONTAINER);
        return container;
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

    protected renderLastCommit(): h.Child {
        if (!this.lastCommit) {
            return '';
        }
        const { commit, avatar } = this.lastCommit;
        const gravatar = h.div({ className: GitWidget.Styles.LAST_COMMIT_MESSAGE_AVATAR }, h.img({ src: avatar }));
        const summary = h.div({ className: GitWidget.Styles.LAST_COMMIT_MESSAGE_SUMMARY }, commit.summary);
        const time = h.div({ className: GitWidget.Styles.LAST_COMMIT_MESSAGE_TIME }, `${commit.authorDateRelative} by ${commit.author.name}`);
        const details = h.div({ className: GitWidget.Styles.LAST_COMMIT_DETAILS }, summary, time);
        // Yes, a container. Otherwise the button would stretch vertically. And having a bigger `Undo` button than a `Commit` would be odd.
        const buttonContainer = h.div({ className: GitWidget.Styles.FLEX_CENTER }, h.button({
            className: `theia-button`,
            title: 'Undo last commit',
            onclick: () => this.undo.bind(this)()
        }, 'Undo'));
        return VirtualRenderer.flatten([gravatar, details, buttonContainer]);
    }

    protected renderCommandBar(repository: Repository | undefined): h.Child {
        const refresh = h.a({
            className: 'toolbar-button',
            title: 'Refresh',
            onclick: async e => {
                await this.repositoryProvider.refresh();
            }
        }, h.i({ className: 'fa fa-refresh' }));
        const more = repository ? h.a({
            className: 'toolbar-button',
            title: 'More...',
            onclick: event => {
                const el = (event.target as HTMLElement).parentElement;
                if (el) {
                    this.contextMenuRenderer.render(GitWidget.ContextMenu.PATH, {
                        x: el.getBoundingClientRect().left,
                        y: el.getBoundingClientRect().top + el.offsetHeight
                    });
                }
            }
        }, h.i({ className: 'fa fa-ellipsis-h' })) : '';
        const signOffBy = repository ? h.a({
            className: 'toolbar-button',
            title: 'Add Signed-off-by',
            onclick: async () => {
                const { selectedRepository } = this.repositoryProvider;
                if (selectedRepository) {
                    const [username, email] = await this.getUserConfig(selectedRepository);
                    const signOff = `\n\nSigned-off-by: ${username} <${email}>`;
                    const commitTextArea = document.getElementById('theia-git-commit-message') as HTMLTextAreaElement;
                    if (commitTextArea) {
                        const content = commitTextArea.value;
                        if (content.endsWith(signOff)) {
                            commitTextArea.value = content.substr(0, content.length - signOff.length);
                        } else {
                            commitTextArea.value = `${content}${signOff}`;
                        }
                        this.resize(commitTextArea);
                        commitTextArea.focus();
                    }
                }
            }
        }, h.i({ className: 'fa fa-pencil-square-o ' })) : '';
        const commandsContainer = h.div({ className: 'buttons' }, refresh, signOffBy, more);
        const commitButton = h.button({
            className: 'theia-button',
            title: 'Commit all the staged changes',
            onclick: () => this.commit.bind(this)(repository)
        }, 'Commit');
        const commitContainer = h.div({ className: 'buttons' }, commitButton);
        const placeholder = h.div({ className: 'placeholder' });
        return h.div({ id: 'commandBar', className: 'flexcontainer' }, commandsContainer, placeholder, commitContainer);
    }

    protected async getUserConfig(repository: Repository): Promise<[string, string]> {
        const [username, email] = (await Promise.all([
            this.git.exec(repository, ['config', 'user.name']),
            this.git.exec(repository, ['config', 'user.email'])
        ])).map(result => result.stdout.trim());
        return [username, email];
    }

    protected renderGitItemButtons(repository: Repository, change: GitFileChange): h.Child {
        const buttons: h.Child[] = [];
        if (change.staged) {
            buttons.push(h.a({
                className: 'toolbar-button',
                title: 'Unstage Changes',
                onclick: async event => {
                    try {
                        await this.git.unstage(repository, change.uri);
                    } catch (error) {
                        this.logError(error);
                    }
                }
            }, h.i({ className: 'fa fa-minus' })));
        } else {
            buttons.push(h.a({
                className: 'toolbar-button',
                title: 'Discard Changes',
                onclick: async event => {
                    const options: Git.Options.Checkout.WorkingTreeFile = { paths: change.uri };
                    if (change.status === GitFileStatus.New) {
                        this.commandService.executeCommand(WorkspaceCommands.FILE_DELETE.id, new URI(change.uri));
                    } else {
                        try {
                            await this.git.checkout(repository, options);
                        } catch (error) {
                            this.logError(error);
                        }
                    }
                }
            }, h.i({ className: 'fa fa-undo' })));
            buttons.push(h.a({
                className: 'toolbar-button',
                title: 'Stage Changes',
                onclick: async event => {
                    try {
                        await this.git.add(repository, change.uri);
                    } catch (error) {
                        this.logError(error);
                    }
                }
            }, h.i({ className: 'fa fa-plus' })));
        }
        return h.div({ className: 'buttons' }, VirtualRenderer.flatten(buttons));
    }

    protected renderGitItem(repository: Repository | undefined, change: GitFileChangeNode): h.Child {
        if (!repository) {
            return '';
        }
        const iconSpan = h.span({ className: change.icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, change.label + ' ');
        const pathSpan = h.span({ className: 'path' }, change.description);
        const nameAndPathDiv = h.div({
            className: 'noWrapInfo',
            onclick: () => this.openChange(change)
        }, iconSpan, nameSpan, pathSpan);
        const buttonsDiv = this.renderGitItemButtons(repository, change);
        const staged = change.staged ? 'staged ' : '';
        const statusDiv = h.div({
            title: this.getStatusCaption(change.status, change.staged),
            className: 'status ' + staged + GitFileStatus[change.status].toLowerCase()
        }, this.getAbbreviatedStatusCaption(change.status, change.staged));
        const itemButtonsAndStatusDiv = h.div({ className: 'itemButtonsContainer' }, buttonsDiv, statusDiv);
        return h.div({ className: 'gitItem noselect' }, nameAndPathDiv, itemButtonsAndStatusDiv);
    }

    protected renderChangesHeader(title: string): h.Child {
        const stagedChangesHeaderDiv = h.div({ className: 'header' }, title);
        return stagedChangesHeaderDiv;
    }

    protected renderMergeChanges(repository: Repository | undefined): h.Child | undefined {
        const mergeChangeDivs: h.Child[] = [];
        if (this.mergeChanges.length > 0) {
            this.mergeChanges.forEach(change => {
                mergeChangeDivs.push(this.renderGitItem(repository, change));
            });
            return h.div({
                id: 'mergeChanges',
                className: 'changesContainer'
            }, h.div({ className: 'theia-header' }, 'Merge Changes'), VirtualRenderer.flatten(mergeChangeDivs));
        } else {
            return undefined;
        }
    }

    protected renderStagedChanges(repository: Repository | undefined): h.Child | undefined {
        const stagedChangeDivs: h.Child[] = [];
        if (this.stagedChanges.length > 0) {
            this.stagedChanges.forEach(change => {
                stagedChangeDivs.push(this.renderGitItem(repository, change));
            });
            return h.div({
                id: 'stagedChanges',
                className: 'changesContainer'
            }, h.div({ className: 'theia-header' }, 'Staged Changes'), VirtualRenderer.flatten(stagedChangeDivs));
        } else {
            return undefined;
        }
    }

    protected renderUnstagedChanges(repository: Repository | undefined): h.Child | undefined {
        const unstagedChangeDivs: h.Child[] = [];
        if (this.unstagedChanges.length > 0) {
            this.unstagedChanges.forEach(change => {
                unstagedChangeDivs.push(this.renderGitItem(repository, change));
            });
            return h.div({
                id: 'unstagedChanges',
                className: 'changesContainer'
            }, h.div({ className: 'theia-header' }, 'Changed'), VirtualRenderer.flatten(unstagedChangeDivs));
        }

        return undefined;
    }

    // tslint:disable-next-line:no-any
    protected logError(error: any): void {
        const message = error instanceof Error ? error.message : error;
        this.messageService.error(message);
    }

    protected getStatusCaption(status: GitFileStatus, staged?: boolean): string {
        return GitFileStatus.toString(status, staged);
    }

    protected getAbbreviatedStatusCaption(status: GitFileStatus, staged?: boolean): string {
        return GitFileStatus.toAbbreviation(status, staged);
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
        const messageInput = document.getElementById('theia-git-commit-message') as HTMLTextAreaElement;
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
        export const COMMIT_MESSAGE_CONTAINER = 'theia-git-commit-message-container';
        export const COMMIT_MESSAGE = 'theia-git-commit-message';
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
