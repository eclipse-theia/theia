/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, Command } from "../../application/common";
import { EditorManager } from "./editor-manager";

/**
 * Show editor references
 */
export const SHOW_REFERENCES: Command = {
    id: 'textEditor.commands.showReferences'
};

@injectable()
export class EditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(EditorManager) private editorService: EditorManager
    ) { }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand({
            id: 'editor.close',
            label: 'Close Active Editor'
        });
        registry.registerHandler('editor.close', {
            execute: (): any => {
                const editor = this.editorService.activeEditor;
                if (editor) {
                    editor.close();
                }
                return null;
            },
            isEnabled: () => true
        });

        registry.registerCommand({
            id: 'editor.close.all',
            label: 'Close All Editors'
        });
        registry.registerHandler('editor.close.all', {
            execute: (): any => {
                this.editorService.editors.forEach(editor => {
                    editor.close();
                });
                return null;
            },
            isEnabled: () => true
        });

    }
}
