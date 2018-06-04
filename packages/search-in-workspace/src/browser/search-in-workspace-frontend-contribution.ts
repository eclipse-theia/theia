/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractViewContribution, KeybindingRegistry } from "@theia/core/lib/browser";
import { SearchInWorkspaceWidget } from "./search-in-workspace-widget";
import { injectable } from "inversify";
import { CommandRegistry } from "@theia/core";

export namespace SearchInWorkspaceCommands {
    export const TOGGLE_SIW_WIDGET = {
        id: "search-in-workspace.toggle"
    };
    export const OPEN_SIW_WIDGET = {
        id: "search-in-workspace.open",
        label: "Search In Workspace"
    };
}

@injectable()
export class SearchInWorkspaceFrontendContribution extends AbstractViewContribution<SearchInWorkspaceWidget> {

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
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id,
            keybinding: "ctrlcmd+shift+f"
        });
    }
}
