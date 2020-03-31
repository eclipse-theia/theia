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
import { ProtocolToMonacoConverter } from 'monaco-languageclient/lib';
import { Position, Location } from '@theia/languages/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { NativeTextInputFocusContext } from '@theia/core/lib/browser/keybinding';
import { QuickOpenService } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { MonacoEditor } from './monaco-editor';
import { MonacoEditorCommandHandler, MonacoCommandRegistry } from './monaco-command-registry';
import MenuRegistry = monaco.actions.MenuRegistry;
import { MonacoEditorService } from './monaco-editor-service';
import { CommandHandler } from '@theia/core/src/common/command';
import { EditorCommands } from '@theia/editor/lib/browser/editor-command';
import { CommonCommands } from '@theia/core/lib/browser/common-frontend-contribution';

// vs code doesn't use iconClass anymore, but icon instead, so some adaptation is required to reuse it on theia side
export type MonacoIcon = { dark?: monaco.Uri; light?: monaco.Uri } | monaco.theme.ThemeIcon;
export type MonacoCommand = Command & { icon?: MonacoIcon };
export namespace MonacoCommands {

    export const UNDO = 'undo';
    export const REDO = 'redo';
    export const FIND = 'actions.find';
    export const REPLACE = 'editor.action.startFindReplaceAction';
    export const GO_TO_DEFINITION = 'editor.action.revealDefinition';

    /**
     * These commands have to be remapped, as `@theia/core` provides the core functionality and the menu registration.
     * Without this remapping, we would end up either
     *  - with zero `Undo`/`Redo` menu items, if cursor in editor, or
     *  - duplicate ones, as both are registered and valid.
     */
    export const REMAPPED_COMMANDS = new Map<string, string>([
        [UNDO, CommonCommands.UNDO.id],
        [REDO, CommonCommands.REDO.id]
    ]);

    export const ACTIONS = new Map<string, MonacoCommand>();
    export const EXCLUDE_ACTIONS = new Set([
        'editor.action.quickCommand',
        'editor.action.clipboardCutAction',
        'editor.action.clipboardCopyAction',
        'editor.action.clipboardPasteAction'
    ]);
    const icons = new Map<string, MonacoIcon>();
    for (const menuItem of MenuRegistry.getMenuItems(7)) {
        const commandItem = menuItem.command;
        if (commandItem && commandItem.icon) {
            icons.set(commandItem.id, commandItem.icon);
        }
    }
    for (const action of monaco.editorExtensions.EditorExtensionsRegistry.getEditorActions()) {
        const id = action.id;
        if (!EXCLUDE_ACTIONS.has(id)) {
            const label = action.label;
            const icon = icons.get(id);
            ACTIONS.set(id, { id, label, icon });
        }
    }
    for (const keybinding of monaco.keybindings.KeybindingsRegistry.getDefaultKeybindings()) {
        const id = keybinding.command;
        if (!ACTIONS.has(id) && !EXCLUDE_ACTIONS.has(id)) {
            ACTIONS.set(id, { id });
        }
    }
}

@injectable()
export class MonacoEditorCommandHandlers implements CommandContribution {

    @inject(MonacoCommandRegistry)
    protected readonly monacoCommandRegistry: MonacoCommandRegistry;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(ProtocolToMonacoConverter)
    protected readonly p2m: ProtocolToMonacoConverter;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(MonacoEditorService)
    protected readonly editorService: MonacoEditorService;

    @inject(NativeTextInputFocusContext)
    protected readonly nativeTextInputFocusContext: NativeTextInputFocusContext;

    private readonly serviceAccessor: monaco.instantiation.ServicesAccessor = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: <T>(id: monaco.instantiation.ServiceIdentifier<T>) => {
            if (id !== monaco.services.ICodeEditorService) {
                throw new Error(`Unhandled service identified: ${id.type}.`);
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return this.editorService as any as T;
        }
    };

    registerCommands(): void {
        this.registerCustomCommandHandlers();
        this.registerBuiltinMonacoEditorCommands();
        this.registerInternalLanguageServiceCommands();
    }

    /**
     * Registers internal monaco commands for language services.
     */
    protected registerInternalLanguageServiceCommands(): void {
        const instantiationService = monaco.services.StaticServices.instantiationService.get();
        const monacoCommands = monaco.commands.CommandsRegistry.getCommands();
        for (const command of monacoCommands.keys()) {
            if (command.startsWith('_execute')) {
                this.commandRegistry.registerCommand(
                    {
                        id: command
                    },
                    {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        execute: (...args: any) => instantiationService.invokeFunction(
                            monacoCommands.get(command)!.handler,
                            ...args
                        )
                    }
                );
            }
        }
    }

    /**
     * Registers all available, built-in `EditorCommand` and `EditorAction` instances from monaco into the Theia command registry.
     * For instance, `editor.action.revealDefinition` which is `Go to Definition` on the UI.
     * Also makes sure to remap commands, such as the monaco-specific `undo` to the `core.undo`.
     */
    protected registerBuiltinMonacoEditorCommands(): void {
        for (const action of MonacoCommands.ACTIONS.values()) {
            const handler = this.newEditorCommandHandler(action.id);
            this.commandRegistry.registerCommand(action, handler);
            const existingCommandId = MonacoCommands.REMAPPED_COMMANDS.get(action.id);
            if (existingCommandId && handler) {
                this.commandRegistry.registerHandler(existingCommandId, handler);
            }
        }
    }

    protected newEditorCommandHandler(id: string): CommandHandler | undefined {
        // First, try to get the editor scoped command.
        const editorCommand = monaco.editorExtensions.EditorExtensionsRegistry.getEditorCommand(id);
        if (editorCommand) {
            return {
                execute: (...args) => editorCommand.runCommand(this.serviceAccessor, args),
                isEnabled: () => !!this.editorService.getActiveCodeEditor() || this.editorService.hasFocusedCodeEditor()
            };
        }

        // Try to get the core command that does not require a focused or active editor. Such as: `Undo`, `Redo`, and `Select All`.
        const command = monaco.commands.CommandsRegistry.getCommand(id);
        if (command) {
            return {
                execute: (...args) => command.handler(this.serviceAccessor, args),
                isEnabled: () => {
                    if (!!this.editorService.getActiveCodeEditor() || this.editorService.hasFocusedCodeEditor()) {
                        return true;
                    }
                    // This is a hack for `EditorOrNativeTextInputCommand`. The target can be an `input` or `textArea`.
                    // This part is executed, when editor is open, but thew focus is in an `input` outside of the editor and you trigger the command from the menu.
                    return this.nativeTextInputFocusContext.isEnabled()
                        && this.isContextKeyExprAware(command)
                        && command.when.keys().indexOf('textInputFocus') !== -1;
                }
            };
        }
        console.error(`Could not find monaco command with ID: '${id}'. Skipping the handler registration.`);
        return undefined;
    }

    private isContextKeyExprAware(command: object & { when?: object }): command is object & { when: monaco.contextkey.ContextKeyExpr } {
        if (command.when) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const when = command.when as any;
            return 'keys' in when && typeof when.keys === 'function' && 'serialize' in when && typeof when.serialize === 'function';
        }
        return false;
    }

    /**
     * Additional, custom commands and handlers for setting the EOL or the indentation in the editor, for instance.
     */
    protected registerCustomCommandHandlers(): void {
        this.monacoCommandRegistry.registerHandler(EditorCommands.SHOW_REFERENCES.id, this.newShowReferenceHandler());
        this.monacoCommandRegistry.registerHandler(EditorCommands.CONFIG_INDENTATION.id, this.newConfigIndentationHandler());
        this.monacoCommandRegistry.registerHandler(EditorCommands.CONFIG_EOL.id, this.newConfigEolHandler());
        this.monacoCommandRegistry.registerHandler(EditorCommands.INDENT_USING_SPACES.id, this.newConfigTabSizeHandler(true));
        this.monacoCommandRegistry.registerHandler(EditorCommands.INDENT_USING_TABS.id, this.newConfigTabSizeHandler(false));
    }

    protected newShowReferenceHandler(): MonacoEditorCommandHandler {
        return {
            execute: (editor: MonacoEditor, uri: string, position: Position, locations: Location[]) => {
                editor.commandService.executeCommand(
                    'editor.action.showReferences',
                    monaco.Uri.parse(uri),
                    this.p2m.asPosition(position),
                    locations.map(l => this.p2m.asLocation(l))
                );
            }
        };
    }

    protected newConfigIndentationHandler(): MonacoEditorCommandHandler {
        return {
            execute: editor => this.configureIndentation(editor)
        };
    }
    protected configureIndentation(editor: MonacoEditor): void {
        const options = [true, false].map(useSpaces =>
            new QuickOpenItem({
                label: `Indent Using ${useSpaces ? 'Spaces' : 'Tabs'}`,
                run: (mode: QuickOpenMode) => {
                    if (mode === QuickOpenMode.OPEN) {
                        this.configureTabSize(editor, useSpaces);
                    }
                    return false;
                }
            })
        );
        this.quickOpenService.open({ onType: (_, acceptor) => acceptor(options) }, {
            placeholder: 'Select Action',
            fuzzyMatchLabel: true
        });
    }

    protected newConfigEolHandler(): MonacoEditorCommandHandler {
        return {
            execute: editor => this.configureEol(editor)
        };
    }
    protected configureEol(editor: MonacoEditor): void {
        const options = ['LF', 'CRLF'].map(lineEnding =>
            new QuickOpenItem({
                label: lineEnding,
                run: (mode: QuickOpenMode) => {
                    if (mode === QuickOpenMode.OPEN) {
                        this.setEol(editor, lineEnding);
                        return true;
                    }
                    return false;
                }
            })
        );
        this.quickOpenService.open({ onType: (_, acceptor) => acceptor(options) }, {
            placeholder: 'Select End of Line Sequence',
            fuzzyMatchLabel: true
        });
    }
    protected setEol(editor: MonacoEditor, lineEnding: string): void {
        const model = editor.document && editor.document.textEditorModel;
        if (model) {
            if (lineEnding === 'CRLF' || lineEnding === '\r\n') {
                model.pushEOL(monaco.editor.EndOfLineSequence.CRLF);
            } else {
                model.pushEOL(monaco.editor.EndOfLineSequence.LF);
            }
        }
    }

    protected newConfigTabSizeHandler(useSpaces: boolean): MonacoEditorCommandHandler {
        return {
            execute: editor => this.configureTabSize(editor, useSpaces)
        };
    }
    protected configureTabSize(editor: MonacoEditor, useSpaces: boolean): void {
        const model = editor.document && editor.document.textEditorModel;
        if (model) {
            const { tabSize } = model.getOptions();
            const sizes = Array.from(Array(8), (_, x) => x + 1);
            const tabSizeOptions = sizes.map(size =>
                new QuickOpenItem({
                    label: size === tabSize ? `${size}   Configured Tab Size` : size.toString(),
                    run: (mode: QuickOpenMode) => {
                        if (mode !== QuickOpenMode.OPEN) {
                            return false;
                        }
                        model.updateOptions({
                            tabSize: size || tabSize,
                            insertSpaces: useSpaces
                        });
                        return true;
                    }
                })
            );
            this.quickOpenService.open({ onType: (_, acceptor) => acceptor(tabSizeOptions) }, {
                placeholder: 'Select Tab Size for Current File',
                fuzzyMatchLabel: true,
                selectIndex: lookFor => {
                    if (!lookFor || lookFor === '') {
                        return tabSize - 1;
                    }
                    return 0;
                }
            });
        }
    }

}
