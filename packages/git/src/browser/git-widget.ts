/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from 'inversify';
import { Git, GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus } from '../common';
import { GIT_CONTEXT_MENU } from './git-context-menu';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { MessageService, ResourceProvider, CommandService, DisposableCollection } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { VirtualRenderer, ContextMenuRenderer, OpenerService, open } from '@theia/core/lib/browser';
import { h } from '@phosphor/virtualdom/lib';
import { Message } from '@phosphor/messaging';
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { GitBaseWidget, GitFileChangeNode } from './git-base-widget';

@injectable()
export class GitWidget extends GitBaseWidget<GitFileChangeNode> {

    protected stagedChanges: GitFileChangeNode[] = [];
    protected unstagedChanges: GitFileChangeNode[] = [];
    protected mergeChanges: GitFileChangeNode[] = [];
    protected message: string = '';
    protected messageInputHighlighted: boolean = false;
    protected additionalMessage: string = '';
    protected status: WorkingDirectoryStatus;
    protected toDispose = new DisposableCollection();

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService) {
        super();
        this.id = 'theia-gitContainer';
        this.title.label = 'Git';
        this.scrollContainer = 'changesOuterContainer';

        this.addClass('theia-git');

    }

    @postConstruct()
    protected init() {
        this.repositoryProvider.onDidChangeRepository(repository => {
            this.initialize(repository);
        });
        this.initialize(this.repositoryProvider.selectedRepository);
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const messageInput = document.getElementById('git-messageInput');
        if (messageInput) {
            messageInput.focus();
        } else {
            this.node.focus();
        }
    }

    async initialize(repository: Repository | undefined): Promise<void> {
        if (repository) {
            this.toDispose.dispose();
            this.toDispose.push(await this.gitWatcher.watchGitChanges(repository));
            this.toDispose.push(this.gitWatcher.onGitEvent(async gitEvent => {
                if (GitStatusChangeEvent.is(gitEvent)) {
                    this.status = gitEvent.status;
                    this.updateView(gitEvent.status);
                }
            }));
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
                    repository ? this.getRepositoryRelativePath(repository, uri.parent) : this.labelProvider.getLongName(uri.parent)
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

    protected render(): h.Child {
        const repository = this.repositoryProvider.selectedRepository;

        const messageInput = this.renderMessageInput();
        const messageTextarea = this.renderMessageTextarea();
        const commandBar = this.renderCommandBar(repository);
        const headerContainer = h.div({ className: 'headerContainer' }, messageInput, messageTextarea, commandBar);

        const mergeChanges = this.renderMergeChanges(repository) || '';
        const stagedChanges = this.renderStagedChanges(repository) || '';
        const unstagedChanges = this.renderUnstagedChanges(repository) || '';
        const changesContainer = h.div({ className: "changesOuterContainer", id: this.scrollContainer }, mergeChanges, stagedChanges, unstagedChanges);

        return [headerContainer, changesContainer];
    }

    protected renderCommandBar(repository: Repository | undefined): h.Child {
        const commit = async () => {
            // need to access the element, because Phosphor.js is not updating `value`but only `setAttribute('value', ....)` which only sets the default value.
            const messageInput = document.getElementById('git-messageInput') as HTMLInputElement;
            if (this.message !== '') {
                const extendedMessageInput = document.getElementById('git-extendedMessageInput') as HTMLInputElement;
                try {
                    // We can make sure, repository exists, otherwise we would not have this button.
                    await this.git.commit(repository!, this.message + "\n\n" + this.additionalMessage);
                    messageInput.value = '';
                    extendedMessageInput.value = '';
                    const status = await this.git.status(repository!);
                    this.updateView(status);
                } catch (error) {
                    this.logError(error);
                }
            } else {
                if (messageInput) {
                    this.messageInputHighlighted = true;
                    this.update();
                    messageInput.focus();
                }
                this.messageService.error('Please provide a commit message!');
            }
        };
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
                    this.contextMenuRenderer.render(GIT_CONTEXT_MENU, {
                        x: el.getBoundingClientRect().left,
                        y: el.getBoundingClientRect().top + el.offsetHeight
                    });
                }
            }
        }, h.i({ className: 'fa fa-ellipsis-h' })) : '';
        const commandsContainer = h.div({ className: 'buttons' }, refresh, more);
        const commitButton = h.button({
            className: 'theia-button',
            title: 'Commit all the staged changes',
            onclick: () => commit()
        }, 'Commit');
        const commitContainer = h.div({ className: 'buttons' }, commitButton);
        const placeholder = h.div({ className: 'placeholder' });
        return h.div({ id: 'commandBar', className: 'flexcontainer' }, commandsContainer, placeholder, commitContainer);
    }

    protected renderMessageInput(): h.Child {
        const input = h.input({
            id: 'git-messageInput',
            oninput: event => {
                const inputElement = (event.target as HTMLInputElement);
                if (inputElement.value !== '') {
                    this.messageInputHighlighted = false;
                }
                this.message = (event.target as HTMLInputElement).value;
            },
            className: this.messageInputHighlighted ? 'warn' : '',
            placeholder: 'Commit message',
            value: this.message
        });
        return h.div({ id: 'messageInputContainer', className: 'flexcontainer row' }, input);
    }

    protected renderMessageTextarea(): h.Child {
        const textarea = h.textarea({
            id: 'git-extendedMessageInput',
            placeholder: 'Extended commit text',
            oninput: event => {
                this.additionalMessage = (event.target as HTMLTextAreaElement).value;
            },
            value: this.additionalMessage
        });
        return h.div({ id: 'messageTextareaContainer', className: 'flexcontainer row' }, textarea);
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
        const changeUri: URI = new URI(change.uri);
        const iconSpan = h.span({ className: change.icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, change.label + ' ');
        const pathSpan = h.span({ className: 'path' }, change.description);
        const nameAndPathDiv = h.div({
            className: 'noWrapInfo',
            onclick: () => {
                let uri: URI;
                if (change.status !== GitFileStatus.New) {
                    if (change.staged) {
                        uri = DiffUris.encode(
                            changeUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                            changeUri.withScheme(GIT_RESOURCE_SCHEME),
                            changeUri.displayName + ' (Index)');
                    } else if (this.stagedChanges.find(c => c.uri === change.uri)) {
                        uri = DiffUris.encode(
                            changeUri.withScheme(GIT_RESOURCE_SCHEME),
                            changeUri,
                            changeUri.displayName + ' (Working tree)');
                    } else if (this.mergeChanges.find(c => c.uri === change.uri)) {
                        uri = changeUri;
                    } else {
                        uri = DiffUris.encode(
                            changeUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                            changeUri,
                            changeUri.displayName + ' (Working tree)');
                    }
                } else if (change.staged) {
                    uri = changeUri.withScheme(GIT_RESOURCE_SCHEME);
                } else if (this.stagedChanges.find(c => c.uri === change.uri)) {
                    uri = DiffUris.encode(
                        changeUri.withScheme(GIT_RESOURCE_SCHEME),
                        changeUri,
                        changeUri.displayName + ' (Working tree)');
                } else {
                    uri = changeUri;
                }
                open(this.openerService, uri);
            }
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
}
