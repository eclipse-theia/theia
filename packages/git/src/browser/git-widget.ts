/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Git, GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus } from '../common';
import { GIT_CONTEXT_MENU } from './git-context-menu';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitRepositoryProvider } from './git-repository-provider';
import { MessageService, ResourceProvider, CommandService, DisposableCollection } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { VirtualRenderer, VirtualWidget, ContextMenuRenderer, OpenerService, open } from '@theia/core/lib/browser';
import { h } from '@phosphor/virtualdom/lib';
import { Message } from '@phosphor/messaging';
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';

export interface GitFileChangeNode extends GitFileChange {
    readonly icon: string;
    readonly label: string;
    readonly description: string;
}

@injectable()
export class GitWidget extends VirtualWidget {

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
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService) {
        super();
        this.id = 'theia-gitContainer';
        this.title.label = 'Git';

        this.addClass('theia-git');
        this.update();

        this.repositoryProvider.onDidChangeRepository(repository => {
            this.initialize(repository);
        });
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
                    repository ? this.getRepositoryRelativePath(repository, uri) : this.labelProvider.getLongName(uri)
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

        const commandBar = this.renderCommandBar(repository);
        const messageInput = this.renderMessageInput();
        const messageTextarea = this.renderMessageTextarea();
        const headerContainer = h.div({ className: 'headerContainer' }, commandBar, messageInput, messageTextarea);

        const mergeChanges = this.renderMergeChanges(repository) || '';
        const stagedChanges = this.renderStagedChanges(repository) || '';
        const unstagedChanges = this.renderUnstagedChanges(repository) || '';
        const changesContainer = h.div({ className: "changesOuterContainer" }, mergeChanges, stagedChanges, unstagedChanges);

        return [headerContainer, changesContainer];
    }

    /**
     * After rendering the DOM elements, it makes sure that the selection (`selectionIndex`) is correct in the repositories
     * drop-down even if one adds/removes local Git clones to/from the workspace.
     *
     * By default the `selectionIndex` is `0`, so we need to set it based on the user's repository selection.
     */
    protected onUpdateRequest(message: Message): void {
        super.onUpdateRequest(message);
        const repositories = this.repositoryProvider.allRepositories;
        // Set the selected repository.
        // tslint:disable-next-line:no-any
        const combo = document.getElementById('repositoryList') as any;
        if (combo && combo.selectedIndex !== undefined && this.repositoryProvider.selectedRepository) {
            const selectedUri = this.repositoryProvider.selectedRepository.localUri.toString();
            const index = repositories.map(repository => repository.localUri.toString()).findIndex(uri => uri === selectedUri);
            if (index !== -1) {
                combo.selectedIndex = index;
            }
        }
    }

    protected renderRepositoryList(): h.Child {
        const repositoryOptionElements: h.Child[] = [];
        this.repositoryProvider.allRepositories.forEach(repository => {
            const uri = new URI(repository.localUri);
            repositoryOptionElements.push(h.option({ value: uri.toString() }, uri.displayName));
        });

        return h.select({
            id: 'repositoryList',
            onchange: async event => {
                const repository = { localUri: (event.target as HTMLSelectElement).value };
                this.repositoryProvider.selectedRepository = repository;
                let status: WorkingDirectoryStatus | undefined = undefined;
                if (repository) {
                    try {
                        status = await this.git.status(repository);
                    } catch (error) {
                        this.logError(error);
                    }
                }
                this.updateView(status);
            }
        }, VirtualRenderer.flatten(repositoryOptionElements));
    }

    protected renderCommandBar(repository: Repository | undefined): h.Child {
        const commit = repository ? h.a({
            className: 'button',
            title: 'Commit',
            onclick: async event => {
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
            }
        }, h.i({ className: 'fa fa-check' })) : '';
        const refresh = h.a({
            className: 'button',
            title: 'Refresh',
            onclick: async e => {
                await this.repositoryProvider.refresh();
            }
        }, h.i({ className: 'fa fa-refresh' }));
        const commands = repository ? h.a({
            className: 'button',
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
        const btnContainer = h.div({ className: 'flexcontainer buttons' }, commit, refresh, commands);
        const repositoryListContainer = h.div({ id: 'repositoryListContainer' }, this.renderRepositoryList());
        return h.div({ id: 'commandBar', className: 'flexcontainer evenlySpreaded' }, repositoryListContainer, btnContainer);
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
                className: 'button',
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
                className: 'button',
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
                className: 'button',
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

    protected getStatusChar(status: GitFileStatus, staged: boolean): string {
        switch (status) {
            case GitFileStatus.New:
            case GitFileStatus.Renamed:
            case GitFileStatus.Copied: return staged ? 'A' : 'U';
            case GitFileStatus.Modified: return 'M';
            case GitFileStatus.Deleted: return 'D';
            case GitFileStatus.Conflicted: return 'C';
        }
        return '';
    }

    protected getRepositoryRelativePath(repository: Repository, uri: URI) {
        const repositoryUri = new URI(repository.localUri);
        return uri.toString().substr(repositoryUri.toString().length + 1);
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
        const statusDiv = h.div({ className: 'status ' + staged + GitFileStatus[change.status].toLowerCase() }, this.getStatusChar(change.status, change.staged || false));
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
