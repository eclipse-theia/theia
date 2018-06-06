/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractViewContribution, KeybindingRegistry, LabelProvider } from "@theia/core/lib/browser";
import { SearchInWorkspaceWidget } from "./search-in-workspace-widget";
import { injectable, inject } from "inversify";
import { CommandRegistry, MenuModelRegistry, SelectionService } from "@theia/core";
import { NAVIGATOR_CONTEXT_MENU } from "@theia/navigator/lib/browser/navigator-contribution";
import { UriCommandHandler, UriAwareCommandHandler } from "@theia/core/lib/common/uri-command-handler";
import URI from "@theia/core/lib/common/uri";

export namespace SearchInWorkspaceCommands {
    export const TOGGLE_SIW_WIDGET = {
        id: "search-in-workspace.toggle"
    };
    export const OPEN_SIW_WIDGET = {
        id: "search-in-workspace.open",
        label: "Search In Workspace"

    };
    export const FIND_IN_FOLDER = {
        id: "search-in-workspace.in-folder",
        label: "Find In Folder..."
    };
}

@injectable()
export class SearchInWorkspaceFrontendContribution extends AbstractViewContribution<SearchInWorkspaceWidget> {

    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    constructor() {
        super({
            widgetId: SearchInWorkspaceWidget.ID,
            widgetName: SearchInWorkspaceWidget.LABEL,
            defaultWidgetOptions: {
                area: "left"
            },
            toggleCommandId: SearchInWorkspaceCommands.TOGGLE_SIW_WIDGET.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SearchInWorkspaceCommands.OPEN_SIW_WIDGET, {
            execute: () => this.openView({
                activate: true
            })
        });

        commands.registerCommand(SearchInWorkspaceCommands.FIND_IN_FOLDER, this.newUriAwareCommandHandler({
            execute: async fileUri => {
                const widget: SearchInWorkspaceWidget = await this.openView({
                    activate: true
                });
                const uriStr = this.labelProvider.getLongName(fileUri);
                widget.findInFolder(uriStr);
            }
        }));
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id,
            keybinding: "ctrlcmd+shift+f"
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...NAVIGATOR_CONTEXT_MENU, '6_find'], {
            commandId: SearchInWorkspaceCommands.FIND_IN_FOLDER.id
        });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }
}
