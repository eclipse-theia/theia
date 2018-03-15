/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { CommandContribution, CommandRegistry, Command } from "@theia/core/lib/common";

export namespace EditorCommands {

    /**
     * Show editor references
     */
    export const SHOW_REFERENCES: Command = {
        id: 'textEditor.commands.showReferences'
    };
    /**
     * Change indentation configuration (i.e., indent using tabs / spaces, and how many spaces per tab)
     */
    export const CONFIG_INDENTATION: Command = {
        id: 'textEditor.commands.configIndentation'
    };
    export const INDENT_USING_SPACES: Command = {
        id: 'textEditor.commands.indentUsingSpaces',
        label: 'Indent Using Spaces'
    };
    export const INDENT_USING_TABS: Command = {
        id: 'textEditor.commands.indentUsingTabs',
        label: 'Indent Using Tabs'
    };
}

@injectable()
export class EditorCommandContribution implements CommandContribution {

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(EditorCommands.SHOW_REFERENCES);
        registry.registerCommand(EditorCommands.CONFIG_INDENTATION);
        registry.registerCommand(EditorCommands.INDENT_USING_SPACES);
        registry.registerCommand(EditorCommands.INDENT_USING_TABS);
    }
}
