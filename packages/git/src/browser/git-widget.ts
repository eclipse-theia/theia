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

@injectable()
export class GitWidget extends VirtualWidget {

    protected localUri = new URI('/Users/jbicker/github/theia').toString();
    protected repository: Repository = { localUri: this.localUri };

    protected stagedChanges: FileChange[] = [];
    protected unstagedChanges: FileChange[] = [];

    constructor( @inject(Git) private git: Git) {
        super();
        this.id = 'gitContainer';
        this.title.label = 'Git';
        this.addClass('theia-git');
    }

    protected onActivateRequest() {
        this.createChangeLists();
    }

    protected createChangeLists(): void {
        this.stagedChanges = [];
        this.unstagedChanges = [];
        this.git.status(this.repository).then(status => {
            status.changes.forEach(change => {
                if (change.staged) {
                    this.stagedChanges.push(change);
                } else {
                    this.unstagedChanges.push(change);
                }
            });
            this.update();
        });
    }

    protected render(): h.Child {
        console.log('RENDER IT');

        const repoList = this.renderRepoList();
        const commandBar = this.renderCommandBar();
        const messageInput = this.renderMessageInput();
        const stagedChanges = this.renderStagedChanges();
        const unstagedChanges = this.renderUnstagedChanges();

        return h.div({ id: 'gitContainer' }, repoList, commandBar, messageInput, stagedChanges, unstagedChanges);
    }

    protected renderRepoList(): h.Child {
        return h.div({ id: 'repositories' }, 'Repo. Nothing here yet');
    }

    protected renderCommandBar(): h.Child {

        return h.div({ id: 'commandBar' }, 'Commands. Nothing here yet');
    }

    protected renderMessageInput(): h.Child {
        const input = h.input({ placeholder: 'Commit message' });
        return h.div({ id: 'messageInput', className: 'flexcontainer' }, input);
    }

    protected renderGitItemButtons(change: FileChange): h.Child {
        const btns: h.Child[] = [];
        if (change.staged) {
            btns.push(h.div({
                className: 'button', onclick: event => {
                    this.git.rm(this.repository, change.uri);
                }
            }, h.i({ className: 'fa fa-minus' })));
        } else {
            btns.push(h.div({
                className: 'button', onclick: event => {
                }
            }, h.i({ className: 'fa fa-undo' })));
            btns.push(h.div({
                className: 'button', onclick: event => {
                    this.git.add(this.repository, change.uri)
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

    protected renderStagedChanges(): h.Child {
        const stagedChangeDivs: h.Child[] = [];
        this.stagedChanges.forEach(change => {
            stagedChangeDivs.push(this.renderGitItem(change));
        });
        return h.div({
            id: 'stagedChanges',
            className: 'changesContainer'
        }, this.renderChangesHeader('Staged changes'), VirtualRenderer.flatten(stagedChangeDivs));
    }

    protected renderUnstagedChanges(): h.Child {
        const unstagedChangeDivs: h.Child[] = [];
        this.unstagedChanges.forEach(change => {
            unstagedChangeDivs.push(this.renderGitItem(change));
        });
        return h.div({
            id: 'unstagedChanges',
            className: 'changesContainer'
        }, this.renderChangesHeader('Changes'), VirtualRenderer.flatten(unstagedChangeDivs));
    }
}
