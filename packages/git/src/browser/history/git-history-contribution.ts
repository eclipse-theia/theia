/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { MenuModelRegistry, CommandRegistry, Command, SelectionService } from '@theia/core';
import { AbstractViewContribution, OpenViewArguments } from '@theia/core/lib/browser';
import { injectable, inject, postConstruct } from 'inversify';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import URI from '@theia/core/lib/common/uri';
import { GitHistoryWidget } from './git-history-widget';
import { Git } from '../../common';
import { GitRepositoryTracker } from '../git-repository-tracker';
import { GitRepositoryProvider } from '../git-repository-provider';
import { EDITOR_CONTEXT_MENU_GIT } from '../git-contribution';
import { ScmService } from '@theia/scm/lib/browser';

export const GIT_HISTORY_ID = 'git-history';
export const GIT_HISTORY_LABEL = 'Git History';
export const GIT_HISTORY_TOGGLE_KEYBINDING = 'alt+h';
export const GIT_HISTORY_MAX_COUNT = 100;

export namespace GitHistoryCommands {
    export const OPEN_FILE_HISTORY: Command = {
        id: 'git-history:open-file-history',
    };
    export const OPEN_BRANCH_HISTORY: Command = {
        id: 'git-history:open-branch-history',
        label: GIT_HISTORY_LABEL
    };
}

export interface GitHistoryOpenViewArguments extends OpenViewArguments {
    uri: string | undefined;
}

@injectable()
export class GitHistoryContribution extends AbstractViewContribution<GitHistoryWidget> {

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;
    @inject(GitRepositoryTracker)
    protected readonly repositoryTracker: GitRepositoryTracker;
    @inject(GitRepositoryProvider)
    protected readonly repositoryProvider: GitRepositoryProvider;
    @inject(ScmService)
    protected readonly scmService: ScmService;

    constructor() {
        super({
            widgetId: GIT_HISTORY_ID,
            widgetName: GIT_HISTORY_LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: GitHistoryCommands.OPEN_BRANCH_HISTORY.id,
            toggleKeybinding: GIT_HISTORY_TOGGLE_KEYBINDING
        });
    }

    @postConstruct()
    protected init() {
        this.scmService.onDidChangeSelectedRepositories(repository => {
            this.refreshWidget(repository ? repository.provider.rootUri : undefined);
        });
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

    async openView(args?: Partial<GitHistoryOpenViewArguments>): Promise<GitHistoryWidget> {
        const widget = await super.openView(args);
        this.refreshWidget(args!.uri);
        return widget;
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.SEARCH, {
            commandId: GitHistoryCommands.OPEN_FILE_HISTORY.id,
            label: GIT_HISTORY_LABEL
        });
        menus.registerMenuAction(EDITOR_CONTEXT_MENU_GIT, {
            commandId: GitHistoryCommands.OPEN_FILE_HISTORY.id,
            label: GIT_HISTORY_LABEL
        });
        super.registerMenus(menus);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(GitHistoryCommands.OPEN_FILE_HISTORY, this.newUriAwareCommandHandler({
            isEnabled: (uri: URI) => !!this.repositoryProvider.findRepository(uri),
            isVisible: (uri: URI) => !!this.repositoryProvider.findRepository(uri),
            execute: async uri => this.openView({ activate: true, uri: uri.toString() }),
        }));
        super.registerCommands(commands);
    }

    protected async refreshWidget(uri: string | undefined) {
        const widget = this.tryGetWidget();
        if (!widget) {
            // the widget doesn't exist, so don't wake it up
            return;
        }
        const options: Git.Options.Log = {
            uri,
            maxCount: GIT_HISTORY_MAX_COUNT,
            shortSha: true
        };
        await widget.setContent(options);
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }

}
