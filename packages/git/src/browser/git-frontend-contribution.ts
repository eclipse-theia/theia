/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from "inversify";
import { GitRepositoryProvider } from './git-repository-provider';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { StatusBar, StatusBarAlignment } from "@theia/core/lib/browser/status-bar/status-bar";
import { Git } from '../common';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import { GIT_COMMANDS } from './git-command';
import { DisposableCollection } from "@theia/core";

export const GIT_WIDGET_FACTORY_ID = 'git';

@injectable()
export class GitFrontendContribution implements FrontendApplicationContribution {

    protected toDispose = new DisposableCollection();

    constructor(
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(Git) protected readonly git: Git,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
        @inject(StatusBar) protected readonly statusBar: StatusBar
    ) { }

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

    async initializeLayout(app: FrontendApplication): Promise<void> {
        this.widgetManager.getOrCreateWidget(GIT_WIDGET_FACTORY_ID).then(widget => {
            app.shell.addToLeftArea(widget, {
                rank: 200
            });
        });
    }

}
