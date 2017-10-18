/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from 'inversify';
import { Git } from '../common/git';
import { GIT_CONTEXT_MENU } from './git-context-menu';
import { GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus } from '../common/model';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitRepositoryProvider } from './git-repository-provider';
import { MessageService, ResourceProvider, Disposable, CommandService } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { VirtualRenderer, VirtualWidget, ContextMenuRenderer, OpenerService, open } from '@theia/core/lib/browser';
import { h } from '@phosphor/virtualdom/lib';
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { FileIconProvider } from '@theia/filesystem/lib/browser/icons/file-icons';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

@injectable()
export class GitWidget extends VirtualWidget {

    protected stagedChanges: GitFileChange[] = [];
    protected unstagedChanges: GitFileChange[] = [];
    protected mergeChanges: GitFileChange[] = [];
    protected message: string = '';
    protected messageInputHighlighted: boolean = false;
    protected additionalMessage: string = '';
    protected status: WorkingDirectoryStatus;
    protected watcherDisposable: Disposable;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(FileIconProvider) protected readonly iconProvider: FileIconProvider,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService) {
        super();
        this.id = 'theia-gitContainer';
        this.title.label = 'Git';

        this.addClass('theia-git');
        this.update();
    }

    protected onActivateRequest() {
        this.initialize();
    }

    async initialize(): Promise<void> {
        await this.repositoryProvider.refresh();
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            this.gitWatcher.dispose();
            this.watcherDisposable = await this.gitWatcher.watchGitChanges(repository);
            this.gitWatcher.onGitEvent(async gitEvent => {
                if (GitStatusChangeEvent.is(gitEvent)) {
                    this.status = gitEvent.status;
                    this.updateView(gitEvent.status);
                }
            });
        }
    }

    protected updateView(status: WorkingDirectoryStatus | undefined) {
        this.stagedChanges = [];
        this.unstagedChanges = [];
        this.mergeChanges = [];
        if (status) {
            status.changes.forEach(change => {
                if (GitFileStatus[GitFileStatus.Conflicted.valueOf()] !== GitFileStatus[change.status]) {
                    if (change.staged) {
                        this.stagedChanges.push(change);
                    } else {
                        this.unstagedChanges.push(change);
                    }
                } else {
                    if (!change.staged) {
                        this.mergeChanges.push(change);
                    }
                }
            });
        }
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
                const status = repository ? await this.git.status(repository) : undefined;
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
                    // We can make sure, repository exists, otherwise we would not have this button.
                    this.git.commit(repository!, this.message + "\n\n" + this.additionalMessage)
                        .then(async () => {
                            messageInput.value = '';
                            extendedMessageInput.value = '';
                            const status = await this.git.status(repository!);
                            this.updateView(status);
                        });
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
                this.initialize();
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
                    this.git.unstage(repository, change.uri);
                }
            }, h.i({ className: 'fa fa-minus' })));
        } else {
            buttons.push(h.a({
                className: 'button',
                title: 'Discard Changes',
                onclick: async event => {
                    const options: Git.Options.Checkout.WorkingTreeFile = { paths: change.uri };
                    if (change.status === GitFileStatus.New) {
                        this.commandService.executeCommand(WorkspaceCommands.FILE_DELETE, new URI(change.uri));
                    } else {
                        this.git.checkout(repository, options);
                    }
                }
            }, h.i({ className: 'fa fa-undo' })));
            buttons.push(h.a({
                className: 'button',
                title: 'Stage Changes',
                onclick: async event => {
                    this.git.add(repository, change.uri);
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

    protected getRepositoryRelativePath(repository: Repository, absPath: string) {
        const repositoryPath = new URI(repository.localUri).path.toString();
        return absPath.replace(repositoryPath, '').replace(/^\//, '');
    }

    protected renderGitItem(repository: Repository | undefined, change: GitFileChange): h.Child {
        if (!repository) {
            return '';
        }
        const changeUri: URI = new URI(change.uri);
        const fileIcon = this.iconProvider.getFileIconForURI(changeUri);
        const iconSpan = h.span({ className: fileIcon });
        const nameSpan = h.span({ className: 'name' }, changeUri.displayName + ' ');
        const pathSpan = h.span({ className: 'path' }, this.getRepositoryRelativePath(repository, changeUri.path.dir.toString()));
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
        const statusDiv = h.div({ className: 'status ' + staged + GitFileStatus[change.status].toLowerCase() }, this.getStatusChar(change.status, change.staged));
        const itemBtnsAndStatusDiv = h.div({ className: 'itemButtonsContainer' }, buttonsDiv, statusDiv);
        return h.div({ className: 'gitItem noselect' }, nameAndPathDiv, itemBtnsAndStatusDiv);
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
}
