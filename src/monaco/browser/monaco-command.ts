/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ProtocolToMonacoConverter } from "monaco-languageclient/lib";
import {
    CommandHandler, CommandContribution, CommandRegistry, CommonCommands, SelectionService
} from '../../application/common';
import { EditorManager, TextEditorSelection, SHOW_REFERENCES } from '../../editor/browser';
import { Position, Location } from "../../languages/common"
import { getCurrent, MonacoEditor } from './monaco-editor';
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;

@injectable()
export class MonacoEditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter
    ) { }

    registerCommands(commands: CommandRegistry) {
        commands.registerCommand(SHOW_REFERENCES, {
            execute: (uri: string, position: Position, locations: Location[]) => {
                const editor = getCurrent(this.editorManager);
                if (editor) {
                    editor.commandService.executeCommand(
                        'editor.action.showReferences',
                        monaco.Uri.parse(uri),
                        this.p2m.asPosition(position),
                        locations.map(l => this.p2m.asLocation(l))
                    );
                }
            }
        });

        [CommonCommands.EDIT_UNDO, CommonCommands.EDIT_REDO].forEach(id => {
            const doExecute = (editor: MonacoEditor, ...args: any[]): any => {
                return editor.getControl().trigger('keyboard', id, args);
            };
            const handler = this.newClipboardHandler(id, doExecute);
            commands.registerHandler(id, handler);
        });

        for (const menuItem of MenuRegistry.getMenuItems(MenuId.EditorContext)) {
            const { id, title, iconClass } = menuItem.command;
            commands.registerCommand({
                id,
                iconClass,
                label: title
            }, this.newHandler(id));
        }
    }

    protected newHandler(id: string): CommandHandler {
        return new EditorCommandHandler(id, this.editorManager, this.selectionService);
    }

    protected newClipboardHandler(id: string, doExecute: (editor: MonacoEditor, ...args: any[]) => any) {
        const commandArgs = (editor: MonacoEditor) => [{}];
        return new TextModificationEditorCommandHandler(this.editorManager, this.selectionService, id, commandArgs, doExecute);
    }

}

export class EditorCommandHandler implements CommandHandler {

    constructor(
        protected readonly id: string,
        protected readonly editorManager: EditorManager,
        protected readonly selectionService: SelectionService
    ) { }

    execute(): Promise<any> {
        const editor = getCurrent(this.editorManager);
        if (editor) {
            return Promise.resolve(editor.runAction(this.id));
        }
        return Promise.resolve();
    }

    isVisible(): boolean {
        return TextEditorSelection.is(this.selectionService.selection);
    }

    isEnabled(): boolean {
        const editor = getCurrent(this.editorManager);
        return !!editor && editor.isActionSupported(this.id);
    }

}

export class TextModificationEditorCommandHandler extends EditorCommandHandler {

    constructor(editorManager: EditorManager,
        selectionService: SelectionService,
        id: string,
        private commandArgs: (editor: MonacoEditor) => any[],
        private doExecute: (editor: MonacoEditor, ...args: any[]) => any
    ) {
        super(id, editorManager, selectionService);
    }

    isEnabled(): boolean {
        return !!getCurrent(this.editorManager);
    }

    execute(): Promise<any> {
        const editor = getCurrent(this.editorManager);
        if (editor) {
            return new Promise<any>((resolve, reject) => {
                editor.focus();
                resolve(this.doExecute(editor, this.commandArgs(editor)));
            });
        }
        return Promise.resolve();
    }

}
