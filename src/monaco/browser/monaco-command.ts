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
import { EditorManager, EditorWidget, TextEditorSelection, SHOW_REFERENCES } from '../../editor/browser';
import { CommandService, Position, Location } from "../../languages/common"
import { MonacoEditor } from "./monaco-editor";
import CommandsRegistry = monaco.commands.CommandsRegistry;
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;
import ICommand = monaco.commands.ICommand;
import IMenuItem = monaco.actions.IMenuItem;

@injectable()
export class MonacoEditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(CommandService) protected readonly commands: CommandService,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter
    ) { }

    contribute(registry: CommandRegistry) {
        this.commands.registerCommand(SHOW_REFERENCES, (uri: string, position: Position, locations: Location[]) => {
            const currentEditor = this.editorManager.currentEditor;
            if (currentEditor && currentEditor.editor instanceof MonacoEditor) {
                currentEditor.editor.getControl()._commandService.executeCommand(
                    SHOW_REFERENCES,
                    monaco.Uri.parse(uri),
                    this.p2m.asPosition(position),
                    locations.map(l => this.p2m.asLocation(l))
                );
            }
        });

        [CommonCommands.EDIT_UNDO, CommonCommands.EDIT_REDO].forEach(id => {
            const doExecute = (editorWidget: EditorWidget, ...args: any[]): any => {
                const editor = editorWidget.editor;
                if (editor instanceof MonacoEditor) {
                    return editor.getControl().trigger('keyboard', id, args);
                }
            };
            const handler = this.newClipboardHandler(id, doExecute);
            registry.registerHandler(id, handler);
        });

        MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => item.command).forEach(command => {
            registry.registerCommand({
                id: command.id,
                label: command.title,
                iconClass: command.iconClass
            });
        });

        const findCommand: (item: IMenuItem) => ICommand = (item) => CommandsRegistry.getCommand(item.command.id);
        const wrap: (item: IMenuItem, command: ICommand) => { item: IMenuItem, command: ICommand } = (item, command) => {
            return { item, command }
        }

        MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => wrap(item, findCommand(item))).forEach(props => {
            const id = props.item.command.id;
            registry.registerHandler(
                id,
                this.newHandler(id)
            );
        });
    }

    private newHandler(id: string): CommandHandler {
        return new EditorCommandHandler(id, this.editorManager, this.selectionService);
    }

    private newClipboardHandler(id: string, doExecute: (editorWidget: EditorWidget, ...args: any[]) => any) {
        const commandArgs = (widget: EditorWidget) => [{}];
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
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor && currentEditor.editor instanceof MonacoEditor) {
            return Promise.resolve(currentEditor.editor.runAction(this.id));
        }
        return Promise.resolve();
    }

    isVisible(): boolean {
        return TextEditorSelection.is(this.selectionService.selection);
    }

    isEnabled(): boolean {
        const currentEditor = this.editorManager.currentEditor;
        return !!currentEditor &&
            currentEditor.editor instanceof MonacoEditor &&
            currentEditor.editor.isActionSupported(this.id);
    }

}

export class TextModificationEditorCommandHandler extends EditorCommandHandler {

    constructor(editorManager: EditorManager,
        selectionService: SelectionService,
        id: string,
        private commandArgs: (widget: EditorWidget | undefined) => any[],
        private doExecute: (widget: EditorWidget | undefined, ...args: any[]) => any
    ) {
        super(id, editorManager, selectionService);
    }

    isEnabled(): boolean {
        return !!this.editorManager.currentEditor;
    }

    execute(): Promise<any> {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor) {
            return new Promise<any>((resolve, reject) => {
                currentEditor.editor.focus();
                resolve(this.doExecute(currentEditor, this.commandArgs(currentEditor)));
            });
        }
        return Promise.resolve();
    }

}
