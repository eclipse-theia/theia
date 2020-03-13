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
import { TextEditorSelection } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';
import { MonacoEditorProvider } from './monaco-editor-provider';

export interface MonacoEditorCommandHandler {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute(editor: MonacoEditor, ...args: any[]): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isEnabled?(editor: MonacoEditor, ...args: any[]): boolean;
}
/**
 * A command handler that will:
 *  1. execute on the focused `current` editor.
 *  2. otherwise, if the `document.activeElement` is either an `input` or a `textArea`, executes the browser built-in command on it.
 *  3. otherwise, invoke a command on the current editor after setting the focus on it.
 */
export interface MonacoEditorOrNativeTextInputCommandHandler extends MonacoEditorCommandHandler {
    domCommandId: string;
}
export namespace MonacoEditorOrNativeTextInputCommand {

    export function is(command: Partial<MonacoEditorOrNativeTextInputCommandHandler>): command is MonacoEditorOrNativeTextInputCommandHandler {
        return !!command.domCommandId;
    }

    export function isEnabled(command: Partial<MonacoEditorOrNativeTextInputCommandHandler>): command is MonacoEditorOrNativeTextInputCommandHandler {
        return !!command.domCommandId && !!isNativeTextInput();
    }

    /**
     * same as `isEnabled`.
     */
    export function isVisible(command: Partial<MonacoEditorOrNativeTextInputCommandHandler>): command is MonacoEditorOrNativeTextInputCommandHandler {
        return isEnabled(command);
    }

    export function execute({ domCommandId: id }: MonacoEditorOrNativeTextInputCommandHandler): void {
        const { activeElement } = document;
        if (isNativeTextInput(activeElement)) {
            console.trace(`Executing DOM command '${id}' on 'activeElement': ${activeElement}`);
            document.execCommand(id);
        } else {
            console.warn(`Failed to execute the DOM command '${id}'. Expected 'activeElement' to be an 'input' or a 'textArea'. Was: ${activeElement}`);
        }
    }

    /**
     * `element` defaults to `document.activeElement`.
     */
    function isNativeTextInput(element: Element | null = document.activeElement): element is HTMLInputElement | HTMLTextAreaElement {
        return !!element && ['input', 'textarea'].indexOf(element.tagName.toLowerCase()) >= 0;
    }

}
@injectable()
export class MonacoCommandRegistry {

    @inject(MonacoEditorProvider)
    protected readonly monacoEditors: MonacoEditorProvider;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    validate(command: string): string | undefined {
        return this.commands.commandIds.indexOf(command) !== -1 ? command : undefined;
    }

    registerCommand(command: Command, handler: MonacoEditorCommandHandler): void {
        this.commands.registerCommand({
            ...command,
            id: command.id
        }, this.newHandler(handler));
    }

    registerHandler(command: string, handler: MonacoEditorCommandHandler): void {
        const delegate = this.newHandler(handler) as MonacoEditorCommandHandler;
        this.commands.registerHandler(command, delegate);
    }

    protected newHandler(monacoHandler: MonacoEditorCommandHandler): CommandHandler {
        const handler: CommandHandler = {
            execute: (...args: any) => this.execute(monacoHandler, ...args), // eslint-disable-line @typescript-eslint/no-explicit-any
            isEnabled: (...args: any) => this.isEnabled(monacoHandler, ...args), // eslint-disable-line @typescript-eslint/no-explicit-any
            isVisible: (...args: any) => this.isVisible(monacoHandler, ...args) // eslint-disable-line @typescript-eslint/no-explicit-any
        };
        if (MonacoEditorOrNativeTextInputCommand.is(monacoHandler)) {
            const { domCommandId } = monacoHandler;
            return <MonacoEditorOrNativeTextInputCommandHandler>{
                ...handler,
                domCommandId
            };
        }
        return handler;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected execute(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): any {
        const editor = this.monacoEditors.current;
        // Only if the monaco editor has the text focus; the cursor blinks inside the editor widget.
        if (editor && editor.isFocused()) {
            return Promise.resolve(monacoHandler.execute(editor, ...args));
        }
        if (MonacoEditorOrNativeTextInputCommand.is(monacoHandler)) {
            return Promise.resolve(MonacoEditorOrNativeTextInputCommand.execute(monacoHandler));
        }
        if (editor) {
            editor.focus();
            return Promise.resolve(monacoHandler.execute(editor, ...args));
        }
        return Promise.resolve();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected isEnabled(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        if (MonacoEditorOrNativeTextInputCommand.isEnabled(monacoHandler)) {
            return true;
        }
        const editor = this.monacoEditors.current;
        return !!editor && (!monacoHandler.isEnabled || monacoHandler.isEnabled(editor, ...args));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected isVisible(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        return MonacoEditorOrNativeTextInputCommand.isVisible(monacoHandler)
            || TextEditorSelection.is(this.selectionService.selection);
    }

}
