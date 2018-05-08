/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MenuModelRegistry, CommandRegistry, Command, SelectionService } from '@theia/core';
import { AbstractViewContribution } from '@theia/core/lib/browser';
import { injectable, inject, postConstruct } from 'inversify';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import URI from '@theia/core/lib/common/uri';
import { GitHistoryWidget } from './git-history-widget';
import { Git } from '../../common';
import { GitRepositoryTracker } from '../git-repository-tracker';

export namespace GitHistoryCommands {
    export const OPEN_FILE_HISTORY: Command = {
        id: 'git-history:open-file-history',
        label: 'Git History'
    };
    export const OPEN_BRANCH_HISTORY: Command = {
        id: 'git-history:open-branch-history'
    };
}

export const GIT_HISTORY = 'git-history';
export const GIT_HISTORY_MAX_COUNT = 100;
@injectable()
export class GitHistoryContribution extends AbstractViewContribution<GitHistoryWidget> {

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;
    @inject(GitRepositoryTracker)
    protected readonly repositoryTracker: GitRepositoryTracker;

    constructor() {
        super({
            widgetId: GIT_HISTORY,
            widgetName: 'Git History',
            defaultWidgetOptions: {
                area: 'left',
                rank: 400
            },
            toggleCommandId: GitHistoryCommands.OPEN_BRANCH_HISTORY.id,
            toggleKeybinding: 'alt+h'
        });
    }

    @postConstruct()
    protected init() {
        this.repositoryTracker.onDidChangeRepository(async repository =>
            this.refreshWidget(repository ? repository.localUri : undefined)
        );
        this.repositoryTracker.onGitEvent(event => {
            const { source, status, oldStatus } = event;
            let isBranchChanged = false;
            let isHeaderChanged = false;
            if (oldStatus) {
                isBranchChanged = status.branch !== oldStatus.branch;
                isHeaderChanged = status.currentHead !== oldStatus.currentHead;
            }
            if (isBranchChanged || isHeaderChanged || oldStatus === undefined) {
                this.refreshWidget(source.localUri);
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...NAVIGATOR_CONTEXT_MENU, '5_history'], {
            commandId: GitHistoryCommands.OPEN_FILE_HISTORY.id
        });

        super.registerMenus(menus);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(GitHistoryCommands.OPEN_FILE_HISTORY, this.newUriAwareCommandHandler({
            execute: async uri => this.showWidget(uri.toString())
        }));
        commands.registerCommand(GitHistoryCommands.OPEN_BRANCH_HISTORY, {
            execute: () => this.showWidget(undefined)
        });
    }

    async showWidget(uri: string | undefined) {
        this.refreshWidget(uri);
        this.openView({
            activate: true
        });
    }

    protected async refreshWidget(uri: string | undefined) {
        const options: Git.Options.Log = {
            uri,
            maxCount: GIT_HISTORY_MAX_COUNT,
            shortSha: true
        };
        const widget = await this.widget;
        await widget.setContent(options);
        this.openView({
            activate: false
        });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }

}
