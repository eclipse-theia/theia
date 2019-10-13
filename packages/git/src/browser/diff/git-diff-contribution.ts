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

import { CommandRegistry, Command, MenuModelRegistry, SelectionService, MessageService } from '@theia/core/lib/common';
import { FrontendApplication, AbstractViewContribution } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { injectable, inject } from 'inversify';
import { GitDiffWidget, GIT_DIFF } from './git-diff-widget';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { open, OpenerService } from '@theia/core/lib/browser';
import { NavigatorContextMenu, FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { GitQuickOpenService } from '../git-quick-open-service';
import { FileSystem } from '@theia/filesystem/lib/common';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import URI from '@theia/core/lib/common/uri';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import { Git, Repository } from '../../common';
import { WorkspaceRootUriAwareCommandHandler } from '@theia/workspace/lib/browser/workspace-commands';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export namespace GitDiffCommands {
    export const OPEN_FILE_DIFF: Command = {
        id: 'git-diff:open-file-diff',
        category: 'Git Diff',
        label: 'Compare With...'
    };
}

export namespace ScmNavigatorMoreToolbarGroups {
    export const SCM = '3_navigator_scm';
}

@injectable()
export class GitDiffContribution extends AbstractViewContribution<GitDiffWidget> implements TabBarToolbarContribution {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(FileNavigatorContribution)
    protected readonly fileNavigatorContribution: FileNavigatorContribution;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    constructor(
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(OpenerService) protected openerService: OpenerService,
        @inject(MessageService) protected readonly notifications: MessageService,
        @inject(ScmService) protected readonly scmService: ScmService
    ) {
        super({
            widgetId: GIT_DIFF,
            widgetName: 'Git diff',
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.COMPARE, {
            commandId: GitDiffCommands.OPEN_FILE_DIFF.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(GitDiffCommands.OPEN_FILE_DIFF, this.newWorkspaceRootUriAwareCommandHandler({
            isVisible: uri => !!this.findGitRepository(uri),
            isEnabled: uri => !!this.findGitRepository(uri),
            execute: async fileUri => {
                await this.quickOpenService.chooseTagsAndBranches(
                    async (fromRevision, toRevision) => {
                        const uri = fileUri.toString();
                        const fileStat = await this.fileSystem.getFileStat(uri);
                        const options: Git.Options.Diff = {
                            uri,
                            range: {
                                fromRevision
                            }
                        };
                        if (fileStat) {
                            if (fileStat.isDirectory) {
                                this.showWidget(options);
                            } else {
                                const fromURI = fileUri.withScheme(GIT_RESOURCE_SCHEME).withQuery(fromRevision);
                                const toURI = fileUri;
                                const diffUri = DiffUris.encode(fromURI, toURI);
                                if (diffUri) {
                                    open(this.openerService, diffUri).catch(e => {
                                        this.notifications.error(e.message);
                                    });
                                }
                            }
                        }
                    }, this.findGitRepository(fileUri));
            }
        }));
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        this.fileNavigatorContribution.registerMoreToolbarItem({
            id: GitDiffCommands.OPEN_FILE_DIFF.id,
            command: GitDiffCommands.OPEN_FILE_DIFF.id,
            tooltip: GitDiffCommands.OPEN_FILE_DIFF.label,
            group: ScmNavigatorMoreToolbarGroups.SCM,
        });
    }

    protected findGitRepository(uri: URI): Repository | undefined {
        const repo = this.scmService.findRepository(uri);
        if (repo && repo.provider.id === 'git') {
            return { localUri: repo.provider.rootUri };
        }
        return undefined;
    }

    async showWidget(options: Git.Options.Diff): Promise<GitDiffWidget> {
        const widget = await this.widget;
        await widget.setContent(options);
        return this.openView({
            activate: true
        });
    }

    protected newWorkspaceRootUriAwareCommandHandler(handler: UriCommandHandler<URI>): WorkspaceRootUriAwareCommandHandler {
        return new WorkspaceRootUriAwareCommandHandler(this.workspaceService, this.selectionService, handler);
    }
}
