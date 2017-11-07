/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, Command } from "@theia/core/lib/common";
import { EditorManager } from "./editor-manager";

export namespace EditorCommands {

    /**
     * Show editor references
     */
    export const SHOW_REFERENCES: Command = {
        id: 'textEditor.commands.showReferences'
    };

    export const CLOSE: Command = {
        id: 'editor.close',
        label: 'Close Active Editor'
    };
    export const CLOSE_ALL: Command = {
        id: 'editor.close.all',
        label: 'Close All Editors'
    };

}

@injectable()
export class EditorCommandContribution implements CommandContribution {

    constructor(
        @inject(EditorManager) private editorService: EditorManager
    ) { }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(EditorCommands.SHOW_REFERENCES);

        registry.registerCommand(EditorCommands.CLOSE, {
            execute: () => {
                const editor = this.editorService.activeEditor;
                if (editor) {
                    editor.close();
                }
            }
        });
        registry.registerCommand(EditorCommands.CLOSE_ALL, {
            execute: () => {
                this.editorService.editors.forEach(editor => {
                    editor.close();
                });
            }
        });
    }
}
