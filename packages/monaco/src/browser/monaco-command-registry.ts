/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import { Command, CommandHandler, CommandRegistry, SelectionService } from '@theia/core';
import { EditorManager, TextEditorSelection } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';

export interface MonacoEditorCommandHandler {
    // tslint:disable-next-line:no-any
    execute(editor: MonacoEditor, ...args: any[]): any;
    // tslint:disable-next-line:no-any
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

    // tslint:disable-next-line:no-any
    protected execute(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): any {
        const editor = MonacoEditor.getCurrent(this.editorManager);
        if (editor) {
            editor.focus();
            return Promise.resolve(monacoHandler.execute(editor, ...args));
        }
        return Promise.resolve();
    }

    // tslint:disable-next-line:no-any
    protected isEnabled(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        const editor = MonacoEditor.getCurrent(this.editorManager);
        return !!editor && (!monacoHandler.isEnabled || monacoHandler.isEnabled(editor, ...args));
    }

    // tslint:disable-next-line:no-any
    protected isVisible(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        return TextEditorSelection.is(this.selectionService.selection);
    }

}
