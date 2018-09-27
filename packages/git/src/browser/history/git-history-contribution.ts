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
import { AbstractViewContribution } from '@theia/core/lib/browser';
import { injectable, inject, postConstruct } from 'inversify';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import URI from '@theia/core/lib/common/uri';
import { GitHistoryWidget } from './git-history-widget';
import { Git } from '../../common';
import { GitRepositoryTracker } from '../git-repository-tracker';
import { GitRepositoryProvider } from '../git-repository-provider';

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
    @inject(GitRepositoryProvider)
    protected readonly repositoryProvider: GitRepositoryProvider;

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
        this.repositoryTracker.onDidChangeRepository(async repository => {
            this.refreshWidget(repository ? repository.localUri : undefined);
        }
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
            execute: async uri => this.showWidget(uri.toString()),
            isEnabled: (uri: URI) => {
                for (const repo of this.repositoryProvider.allRepositories) {
                    if (new URI(repo.localUri).isEqualOrParent(uri)) {
                        return true;
                    }
                }
                return false;
            }
        }));
        commands.registerCommand(GitHistoryCommands.OPEN_BRANCH_HISTORY, {
            execute: () => this.showWidget(undefined)
        });
    }

    async showWidget(uri: string | undefined) {
        await this.openView({
            activate: true
        });
        this.refreshWidget(uri);
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
