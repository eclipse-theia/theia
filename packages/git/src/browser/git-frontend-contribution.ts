/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from "inversify";
import { GitRepositoryProvider } from './git-repository-provider';
import { FrontendApplication } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from "@theia/core/lib/browser/status-bar/status-bar";
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_COMMANDS } from './git-command';
import { DisposableCollection } from "@theia/core";
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { GitWidget } from './git-widget';

export const GIT_WIDGET_FACTORY_ID = 'git';

@injectable()
export class GitFrontendContribution extends AbstractViewContribution<GitWidget> {

    protected toDispose = new DisposableCollection();

    @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider;
    @inject(GitWatcher) protected readonly gitWatcher: GitWatcher;
    @inject(StatusBar) protected readonly statusBar: StatusBar;

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
        this.repositoryProvider.onDidChangeRepository(async repository => {
            if (repository) {
                this.toDispose.dispose();
                this.toDispose.push(await this.gitWatcher.watchGitChanges(repository));
                this.toDispose.push(
                    this.gitWatcher.onGitEvent((gitStatus: GitStatusChangeEvent) => {
                        if (gitStatus.status.branch) {
                            this.statusBar.setElement('git-repository-status', {
                                text: `$(code-fork) ${gitStatus.status.branch}`,
                                alignment: StatusBarAlignment.LEFT,
                                priority: 100,
                                command: GIT_COMMANDS.CHECKOUT.id
                            });
                        }
                    }));
            }
        });
        this.repositoryProvider.refresh();
    }

}
