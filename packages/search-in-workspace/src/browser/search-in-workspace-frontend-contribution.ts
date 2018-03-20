/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractViewContribution } from "@theia/core/lib/browser";
import { SearchInWorkspaceWidget } from "./search-in-workspace-widget";
import { injectable } from "inversify";

export namespace SearchInWorkspaceCommands {
    export const OPEN_SIW_WIDGET = {
        id: "search-in-workspace.open"
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
            toggleCommandId: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id,
            toggleKeybinding: "ctrlcmd+shift+f"
        });
    }
}
