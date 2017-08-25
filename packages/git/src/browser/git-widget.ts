/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */


import { VirtualRenderer, VirtualWidget } from '@theia/core/lib/browser';
import { injectable, inject } from 'inversify';
import { Git } from '../common/git';
import URI from '@theia/core/lib/common/uri';
import { h } from '@phosphor/virtualdom/lib';
import { FileChange, FileStatus, Repository } from '../common/model';
import { GitWatcher } from '../common/git-watcher';

@injectable()
export class GitWidget extends VirtualWidget {

    protected localUri: string;
    protected repository: Repository;

    protected repositories: Repository[] = [];
    protected stagedChanges: FileChange[] = [];
    protected unstagedChanges: FileChange[] = [];
    protected message: string = '';

    constructor( @inject(Git) private git: Git, @inject(GitWatcher) gitWatcher: GitWatcher) {
        super();
        this.id = 'gitContainer';
        this.title.label = 'Git';
        this.addClass('theia-git');

        this.initialize();
    }

    // todo we dont need this anymore after we have a watcher properly implemented. for now it is just convenience to reinitialize the view
    protected onActivateRequest() {
        this.initialize();
    }

    async initialize(): Promise<void> {
        this.message = '';
        this.repositories = await this.git.repositories();
        if (!this.localUri) {
            this.repository = this.repositories[0];
        } else {
            this.repository = { localUri: this.localUri };
        }
        this.stagedChanges = [];
        this.unstagedChanges = [];
        const status = await this.git.status(this.repository);
        status.changes.forEach(change => {
            if (change.staged) {
                this.stagedChanges.push(change);
            } else {
                this.unstagedChanges.push(change);
            }
        });
        this.update();
    }

    protected render(): h.Child {
        const repoList = this.renderRepoList();
        const commandBar = this.renderCommandBar();
        const messageInput = this.renderMessageInput();
        const messageTextarea = this.renderMessageTextarea();
        const stagedChanges = this.renderStagedChanges() || '';
        const unstagedChanges = this.renderUnstagedChanges() || '';

        return h.div({ id: 'gitContainer' }, repoList, commandBar, messageInput, messageTextarea, stagedChanges, unstagedChanges);
    }

    protected renderRepoList(): h.Child {
        const repoOptionElements: h.Child[] = [];
        this.repositories.forEach(repo => {
            const uri = new URI(repo.localUri);
            repoOptionElements.push(h.option({ value: uri.path.toString() }, uri.displayName));
        });

        const selectElement = h.select({
            id: 'repositoryList',
            onchange: event => {
                this.localUri = (event.target as HTMLSelectElement).value;
                this.initialize();
            }
        }, VirtualRenderer.flatten(repoOptionElements));
        return h.div({ id: 'repositoryListContainer' }, selectElement);
    }

    protected renderCommandBar(): h.Child {
        const commit = h.div({
            className: 'button',
            onclick: event => {
                if (this.message !== '') {
                    console.log('commit', this.message);
                    this.git.commit(this.repository, this.message);
                } else {
                    // document.getElementById('messageInput').className += ' warn';
                    // document.getElementById('messageInput').focus();
                }
            }
        }, h.i({ className: 'fa fa-check' }));
        const refresh = h.div({ className: 'button' }, h.i({ className: 'fa fa-refresh' }));
        const btnContainer = h.div({ className: 'flexcontainer buttons' }, commit, refresh);
        const leftContainer = h.div({});
        return h.div({ id: 'commandBar', className: 'flexcontainer evenlySpreaded' }, leftContainer, btnContainer);
    }

    protected renderMessageInput(): h.Child {
        const input = h.input({
            id: 'messageInput',
            placeholder: 'Commit message', onkeyup: event => {
                this.message = (event.target as HTMLInputElement).value;
            },
            value: this.message
        });
        return h.div({ id: 'messageInputContainer', className: 'flexcontainer row' }, input);
    }

    protected renderMessageTextarea(): h.Child {
        const textarea = h.textarea({ placeholder: 'Extended commit text' });
        return h.div({ id: 'messageTextareaContainer', className: 'flexcontainer row' }, textarea);
    }

    protected renderGitItemButtons(change: FileChange): h.Child {
        const btns: h.Child[] = [];
        if (change.staged) {
            btns.push(h.div({
                className: 'button',
                onclick: event => {
                    this.git.rm(this.repository, change.uri);
                }
            }, h.i({ className: 'fa fa-minus' })));
        } else {
            btns.push(h.div({
                className: 'button',
                onclick: event => {
                }
            }, h.i({ className: 'fa fa-undo' })));
            btns.push(h.div({
                className: 'button',
                onclick: event => {
                    this.git.add(this.repository, change.uri);
                }
            }, h.i({ className: 'fa fa-plus' })));
        }
        return h.div({ className: 'buttons' }, VirtualRenderer.flatten(btns));
    }

    protected renderGitItem(change: FileChange): h.Child {
        const uri: URI = new URI(change.uri);
        const nameSpan = h.span({ className: 'name' }, uri.displayName + ' ');
        const pathSpan = h.span({ className: 'path' }, uri.path.dir.toString());
        const nameAndPathDiv = h.div({ className: 'noWrapInfo' }, nameSpan, pathSpan);
        const buttonsDiv = this.renderGitItemButtons(change);
        const staged = change.staged ? 'staged ' : '';
        const statusDiv = h.div({ className: 'status ' + staged + FileStatus[change.status].toLowerCase() }, FileStatus[change.status].charAt(0));
        const itemBtnsAndStatusDiv = h.div({ className: 'itemButtonsContainer' }, buttonsDiv, statusDiv);
        return h.div({ className: 'gitItem' }, nameAndPathDiv, itemBtnsAndStatusDiv);
    }

    protected renderChangesHeader(title: string): h.Child {
        const stagedChangesHeaderDiv = h.div({ className: 'changesHeader' }, title);
        return stagedChangesHeaderDiv;
    }

    protected renderStagedChanges(): h.Child | undefined {
        const stagedChangeDivs: h.Child[] = [];
        if (this.stagedChanges.length > 0) {
            this.stagedChanges.forEach(change => {
                stagedChangeDivs.push(this.renderGitItem(change));
            });
            return h.div({
                id: 'stagedChanges',
                className: 'changesContainer'
            }, h.div({ className: 'changesHeader' }, 'Staged changes'), VirtualRenderer.flatten(stagedChangeDivs));
        } else {
            return undefined;
        }
    }

    protected renderUnstagedChanges(): h.Child {
        const unstagedChangeDivs: h.Child[] = [];
        if (this.unstagedChanges.length > 0) {
            this.unstagedChanges.forEach(change => {
                unstagedChangeDivs.push(this.renderGitItem(change));
            });
            return h.div({
                id: 'unstagedChanges',
                className: 'changesContainer'
            }, h.div({ className: 'changesHeader' }, 'Changes'), VirtualRenderer.flatten(unstagedChangeDivs));
        }

        return '';
    }
}
