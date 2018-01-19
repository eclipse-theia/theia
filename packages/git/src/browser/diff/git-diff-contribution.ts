/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitDiffService } from './git-diff-service';
import { CommandRegistry, Command, MenuModelRegistry, SelectionService } from "@theia/core/lib/common";
import { FrontendApplication, AbstractViewContribution } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { injectable, inject } from "inversify";
import { GitLogOptions } from './git-diff-model';
import { GitDiffWidget } from './git-diff-widget';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-menu';
import { UriCommandHandler, FileSystemCommandHandler } from '@theia/workspace/lib/browser/workspace-commands';
import { GitQuickOpenService } from '../git-quick-open-service';

export namespace GitDiffCommands {
    export const OPEN_DIFF: Command = {
        id: 'git-diff:toggle',
        label: 'Diff'
    };
    export const OPEN_FILE_DIFF: Command = {
        id: 'git-diff:open-file-diff',
        label: 'Compare with...'
    };
}

export const GIT_DIFF = "git-diff";

@injectable()
export class GitDiffContribution extends AbstractViewContribution<GitDiffWidget> {

    constructor(
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(GitDiffService) protected readonly service: GitDiffService,
        @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService
    ) {
        super({
            widgetId: GIT_DIFF,
            widgetName: 'Git diff',
            defaultWidgetOptions: {
                area: 'left',
                rank: 400
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...NAVIGATOR_CONTEXT_MENU, '5_history'], {
            commandId: GitDiffCommands.OPEN_FILE_DIFF.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(GitDiffCommands.OPEN_FILE_DIFF, this.newFileHandler({
            execute: async fileUri => {
                await this.quickOpenService.chooseTagsAndBranches(
                    (fromRevision, toRevision) => {
                        const options: GitLogOptions = {
                            fileUri,
                            fromRevision,
                            toRevision
                        };
                        this.service.setData(options);
                        this.openView({
                            toggle: true,
                            activate: true
                        });
                    });
            }
        }));
        commands.registerCommand(GitDiffCommands.OPEN_DIFF, {
            execute: async (options: GitLogOptions) => {
                if (options) {
                    this.service.setData(options);
                    this.openView({
                        toggle: true,
                        activate: true
                    });
                }
            }
        });
    }

    protected newFileHandler(handler: UriCommandHandler): FileSystemCommandHandler {
        return new FileSystemCommandHandler(this.selectionService, handler);
    }

}
