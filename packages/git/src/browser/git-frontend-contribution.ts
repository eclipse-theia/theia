/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import { FrontendApplication } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { GIT_COMMANDS } from './git-command';
import { DisposableCollection } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { GitWidget } from './git-widget';
import { GitRepositoryTracker } from './git-repository-tracker';

export const GIT_WIDGET_FACTORY_ID = 'git';

const GIT_SELECTED_REPOSITORY = 'git-selected-repository';
const GIT_REPOSITORY_STATUS = 'git-repository-status';
const GIT_AHEAD_BEHIND = 'git-ahead-behind';

@injectable()
export class GitFrontendContribution extends AbstractViewContribution<GitWidget> {

    protected toDispose = new DisposableCollection();

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(GitRepositoryTracker) protected readonly repositoryTracker: GitRepositoryTracker;

    constructor() {
        super({
            widgetId: GIT_WIDGET_FACTORY_ID,
            widgetName: 'Git',
            defaultWidgetOptions: {
                area: 'left',
                rank: 200
            },
            toggleCommandId: 'gitView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+g'
        });
    }

    onStart(app: FrontendApplication) {
        this.repositoryTracker.onDidChangeRepository(repository => {
            if (repository) {
                const path = new URI(repository.localUri).path;
                this.statusBar.setElement(GIT_SELECTED_REPOSITORY, {
                    text: `$(database) ${path.base}`,
                    alignment: StatusBarAlignment.LEFT,
                    priority: 102,
                    command: GIT_COMMANDS.CHANGE_REPOSITORY.id,
                    tooltip: path.toString()
                });
            } else {
                this.statusBar.removeElement(GIT_SELECTED_REPOSITORY);
            }
        });
        this.repositoryTracker.onGitEvent(event => {
            const { status } = event;
            const branch = status.branch ? status.branch : 'NO-HEAD';
            const dirty = status.changes.length > 0 ? '*' : '';
            this.statusBar.setElement(GIT_REPOSITORY_STATUS, {
                text: `$(code-fork) ${branch}${dirty}`,
                alignment: StatusBarAlignment.LEFT,
                priority: 101,
                command: GIT_COMMANDS.CHECKOUT.id
            });
            if (status.aheadBehind === undefined) {
                this.statusBar.removeElement(GIT_AHEAD_BEHIND);
            } else {
                const { ahead, behind } = status.aheadBehind;
                if (ahead > 0 || behind > 0) {
                    this.statusBar.setElement(GIT_AHEAD_BEHIND, {
                        text: `${behind}↓ ${ahead}↑`,
                        alignment: StatusBarAlignment.LEFT,
                        priority: 100
                    });
                } else {
                    this.statusBar.removeElement(GIT_AHEAD_BEHIND);
                }
            }
        });
    }

}
