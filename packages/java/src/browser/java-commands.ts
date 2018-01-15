/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import {
    CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry, KeybindingContext,
    Keybinding, KeybindingContextRegistry, KeybindingContribution, KeybindingRegistry, KeyCode, Key, Modifier
} from '@theia/core/lib/common';
import { EditorCommands, EditorManager, EDITOR_CONTEXT_MENU } from "@theia/editor/lib/browser";
import { WorkspaceEdit, Workspace } from "@theia/languages/lib/common";
import { JavaClientContribution } from "./java-client-contribution";
import { ExecuteCommandRequest } from "monaco-languageclient/lib";

/**
 * Show Java references
 */
export const SHOW_JAVA_REFERENCES: Command = {
    id: 'java.show.references'
};

/**
 * Apply Workspace Edit
 */
export const APPLY_WORKSPACE_EDIT: Command = {
    id: 'java.apply.workspaceEdit'
};

/**
 * Organize Imports
 */
export const JAVA_ORGANIZE_IMPORTS: Command = {
    label: 'Java: Organize Imports',
    id: 'java.edit.organizeImports'
};

const CONTEXT_ID = 'java.editor.context';

@injectable()
export class JavaEditorContext implements KeybindingContext {
    readonly id = CONTEXT_ID;

    constructor( @inject(EditorManager) protected readonly editorService: EditorManager) { }

    isEnabled(arg?: Keybinding) {
        return this.editorService && !!this.editorService.currentEditor && (this.editorService.currentEditor.editor.document.uri.endsWith(".java"));
    }
}

@injectable()
export class JavaCommandContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(JavaEditorContext) protected readonly editorContext: JavaEditorContext,
        @inject(KeybindingContextRegistry) protected readonly keybindingContextRegistry: KeybindingContextRegistry,
        @inject(JavaClientContribution) protected readonly javaClientContribution: JavaClientContribution,
        @inject(EditorManager) protected readonly editorService: EditorManager
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SHOW_JAVA_REFERENCES, {
            execute: (uri: string, position: Position, locations: Location[]) =>
                commands.executeCommand(EditorCommands.SHOW_REFERENCES.id, uri, position, locations)
        });
        commands.registerCommand(APPLY_WORKSPACE_EDIT, {
            execute: (changes: WorkspaceEdit) =>
                !!this.workspace.applyEdit && this.workspace.applyEdit(changes)
        });
        commands.registerCommand(JAVA_ORGANIZE_IMPORTS, {
            execute: async (changes: WorkspaceEdit) => {
                const editor = this.editorService.activeEditor;
                if (!editor) {
                    return false;
                }
                const uri = editor.editor.uri.toString();
                const client = await this.javaClientContribution.languageClient;
                const result = await client.sendRequest(ExecuteCommandRequest.type, {
                    command: JAVA_ORGANIZE_IMPORTS.id,
                    arguments: [
                        uri
                    ]
                });
                if (isWorkspaceEdit(result) && this.workspace.applyEdit) {
                    return await this.workspace.applyEdit(result);
                } else {
                    return false;
                }
            },
            isVisible: () => {
                const result = this.editorContext.isEnabled();
                return result;
            },
            isEnabled: () => this.editorContext.isEnabled()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...EDITOR_CONTEXT_MENU, '1_modification'], {
            commandId: JAVA_ORGANIZE_IMPORTS.id,
            label: 'Organize Imports'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        this.keybindingContextRegistry.registerContext(this.editorContext);
        keybindings.registerKeybinding({
            commandId: JAVA_ORGANIZE_IMPORTS.id,
            contextId: CONTEXT_ID,
            accelerator: ['Accel Shift O'],
            keyCode: KeyCode.createKeyCode({ first: Key.KEY_O, modifiers: [Modifier.M1, Modifier.M2] })
        });
    }
}

function isWorkspaceEdit(edit?: object): edit is WorkspaceEdit {
    return !!edit && ('changes' in edit || 'documentchanges' in edit);
}
