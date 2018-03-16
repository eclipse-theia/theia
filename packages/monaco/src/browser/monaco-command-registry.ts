/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Command, CommandHandler, CommandRegistry, SelectionService } from '@theia/core';
import { EditorManager, TextEditorSelection } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';

export interface MonacoEditorCommandHandler {
    execute(editor: MonacoEditor, ...args: any[]): any;
    isEnabled?(editor: MonacoEditor, ...args: any[]): boolean;
}
@injectable()
export class MonacoCommandRegistry {

    public static MONACO_COMMAND_PREFIX = 'monaco.';

    constructor(
        @inject(CommandRegistry) protected readonly commands: CommandRegistry,
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(SelectionService) protected readonly selectionService: SelectionService
    ) { }

    protected prefix(command: string): string {
        return MonacoCommandRegistry.MONACO_COMMAND_PREFIX + command;
    }

    validate(command: string): string | undefined {
        const monacoCommand = this.prefix(command);
        return this.commands.commandIds.indexOf(monacoCommand) !== -1 ? monacoCommand : undefined;
    }

    registerCommand(command: Command, handler: MonacoEditorCommandHandler): void {
        this.commands.registerCommand({
            ...command,
            id: this.prefix(command.id)
        }, this.newHandler(handler));
    }

    registerHandler(command: string, handler: MonacoEditorCommandHandler): void {
        this.commands.registerHandler(command, this.newHandler(handler));
    }

    protected newHandler(monacoHandler: MonacoEditorCommandHandler): CommandHandler {
        return {
            execute: (...args) => this.execute(monacoHandler, ...args),
            isEnabled: (...args) => this.isEnabled(monacoHandler, ...args),
            isVisible: (...args) => this.isVisible(monacoHandler, ...args)
        };
    }

    protected execute(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): any {
        const editor = MonacoEditor.getCurrent(this.editorManager);
        if (editor) {
            editor.focus();
            return Promise.resolve(monacoHandler.execute(editor, ...args));
        }
        return Promise.resolve();
    }

    protected isEnabled(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        const editor = MonacoEditor.getCurrent(this.editorManager);
        return !!editor && (!monacoHandler.isEnabled || monacoHandler.isEnabled(editor, ...args));
    }

    protected isVisible(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        return TextEditorSelection.is(this.selectionService.selection);
    }

}
