/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MenuModelRegistry, CommandRegistry, Command, SelectionService, KeyCode, Key, Modifier } from "@theia/core";
import { AbstractViewContribution } from "@theia/core/lib/browser";
import { GitLogOptions } from "../diff/git-diff-model";
import { injectable, inject } from "inversify";
import { NAVIGATOR_CONTEXT_MENU } from "@theia/navigator/lib/browser/navigator-menu";
import { UriCommandHandler, FileSystemCommandHandler } from "@theia/workspace/lib/browser/workspace-commands";
import { GitDiffService } from "../diff/git-diff-service";
import { GitHistoryWidget } from './git-history-widget';

export namespace GitHistoryCommands {
    export const OPEN_FILE_HISTORY: Command = {
        id: 'git-history:open-file-history',
        label: 'Open file history'
    };
}

export const GIT_HISTORY_WIDGET = 'git-history';
export const GIT_FILE_HISTORY = 'git-history:toggle-history-view';

@injectable()
export class GitHistoryContribution extends AbstractViewContribution<GitHistoryWidget> {

    constructor(
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(GitDiffService) protected readonly service: GitDiffService) {
        super({
            widgetId: GIT_HISTORY_WIDGET,
            widgetName: 'Git history',
            defaultWidgetOptions: {
                area: 'left',
                rank: 400
            },
            toggleCommandId: GIT_FILE_HISTORY,
            toggleKeybinding: KeyCode.createKeyCode({
                first: Key.KEY_H, modifiers: [Modifier.CTRL, Modifier.SHIFT]
            })
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...NAVIGATOR_CONTEXT_MENU, '5_history'], {
            commandId: GitHistoryCommands.OPEN_FILE_HISTORY.id
        });

        super.registerMenus(menus);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(GitHistoryCommands.OPEN_FILE_HISTORY, this.newFileHandler({
            execute: async uri => {
                const options: GitLogOptions = {
                    fileUri: uri
                };
                this.service.setData(options);
                this.openView({
                    toggle: true,
                    activate: true
                });
            }
        }));
        if (this.toggleCommand) {
            commands.registerCommand(this.toggleCommand, {
                execute: () => {
                    this.service.setData({});
                    this.openView({
                        toggle: true,
                        activate: true
                    });
                }
            });
        }
    }

    protected newFileHandler(handler: UriCommandHandler): FileSystemCommandHandler {
        return new FileSystemCommandHandler(this.selectionService, handler);
    }
}
