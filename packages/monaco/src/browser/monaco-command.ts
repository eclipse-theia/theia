/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ProtocolToMonacoConverter } from "monaco-languageclient/lib";
import { Command, CommandHandler, CommandContribution, CommandRegistry, SelectionService } from '@theia/core';
import { Position, Location } from "@theia/languages/lib/common";
import { CommonCommands } from '@theia/core/lib/browser';
import { EditorManager, TextEditorSelection, SHOW_REFERENCES } from '@theia/editor/lib/browser';
import { getCurrent, MonacoEditor } from './monaco-editor';
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;

export type MonacoCommand = Command & { delegate?: string };
export namespace MonacoCommands {

    export const UNDO = 'undo';
    export const REDO = 'redo';
    export const COMMON_KEYBOARD_ACTIONS = new Set([UNDO, REDO]);
    export const COMMON_ACTIONS: {
        [action: string]: string
    } = {};
    COMMON_ACTIONS[UNDO] = CommonCommands.UNDO.id;
    COMMON_ACTIONS[REDO] = CommonCommands.REDO.id;
    COMMON_ACTIONS['actions.find'] = CommonCommands.FIND.id;
    COMMON_ACTIONS['editor.action.startFindReplaceAction'] = CommonCommands.REPLACE.id;

    export const SELECTION_MENU = '3_selection';

    export const SELECTION_MENU_SELECTION_GROUP = '1_selection_group';
    export const SELECTION_MENU_COPY_MOVE_GROUP = '2_copy_move_group';
    export const SELECTION_MENU_CURSOR_GROUP = '3_cursor_group';

    export const SELECTION_SELECT_ALL = 'editor.action.select.all';
    export const SELECTION_EXPAND_SELECTION = 'editor.action.smartSelect.grow';
    export const SELECTION_SHRINK_SELECTION = 'editor.action.smartSelect.shrink';

    export const SELECTION_COPY_LINE_UP = 'editor.action.copyLinesUpAction';
    export const SELECTION_COPY_LINE_DOWN = 'editor.action.copyLinesDownAction';
    export const SELECTION_MOVE_LINE_UP = 'editor.action.moveLinesUpAction';
    export const SELECTION_MOVE_LINE_DOWN = 'editor.action.moveLinesDownAction';

    export const SELECTION_ADD_CURSOR_ABOVE = 'editor.action.insertCursorAbove';
    export const SELECTION_ADD_CURSOR_BELOW = 'editor.action.insertCursorBelow';
    export const SELECTION_ADD_CURSOR_TO_LINE_END = 'editor.action.insertCursorAtEndOfEachLineSelected';
    export const SELECTION_ADD_NEXT_OCCURRENCE = 'editor.action.addSelectionToNextFindMatch';
    export const SELECTION_ADD_PREVIOUS_OCCURRENCE = 'editor.action.addSelectionToPreviousFindMatch';
    export const SELECTION_SELECT_ALL_OCCURRENCES = 'editor.action.selectHighlights';

    // If you are wondering where the accelerators come from for the menus, see the `monaco-keybinding` module.
    export const ACTIONS: MonacoCommand[] = [
        { id: SELECTION_SELECT_ALL, label: 'Select All', delegate: 'editor.action.selectAll' },
        { id: SELECTION_EXPAND_SELECTION, label: 'Expand Selection' },
        { id: SELECTION_SHRINK_SELECTION, label: 'Shrink Selection' },

        { id: SELECTION_COPY_LINE_UP, label: 'Copy Line Up' },
        { id: SELECTION_COPY_LINE_DOWN, label: 'Copy Line Down' },
        { id: SELECTION_MOVE_LINE_UP, label: 'Move Line Up' },
        { id: SELECTION_MOVE_LINE_DOWN, label: 'Move Line Down' },

        { id: SELECTION_ADD_CURSOR_ABOVE, label: 'Add Cursor Above' },
        { id: SELECTION_ADD_CURSOR_BELOW, label: 'Add Cursor Below' },
        { id: SELECTION_ADD_CURSOR_TO_LINE_END, label: 'Add Cursors to Line Ends' },
        { id: SELECTION_ADD_NEXT_OCCURRENCE, label: 'Add Next Occurrence' },
        { id: SELECTION_ADD_PREVIOUS_OCCURRENCE, label: 'Add Previous Occurrence' },
        { id: SELECTION_SELECT_ALL_OCCURRENCES, label: 'Select All Occurrences' }
    ];
    for (const menuItem of MenuRegistry.getMenuItems(MenuId.EditorContext)) {
        const { id, title, iconClass } = menuItem.command;
        if (!COMMON_ACTIONS[id]) {
            const label = title;
            ACTIONS.push({ id, label, iconClass });
        }
    }

}

export interface MonacoEditorCommandHandler {
    execute(editor: MonacoEditor, ...args: any[]): any;
    isEnabled?(editor: MonacoEditor, ...args: any[]): boolean;
}
@injectable()
export class MonacoEditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter
    ) { }

    registerCommands(commands: CommandRegistry): void {
        const registry = this.newRegistry(commands);
        this.registerCommonCommandHandlers(registry);
        this.registerEditorCommandHandlers(registry);
        this.registerMonacoActionCommands(registry);
    }

    protected registerCommonCommandHandlers(registry: MonacoCommandRegistry): void {
        // tslint:disable-next-line:forin
        for (const action in MonacoCommands.COMMON_ACTIONS) {
            const command = MonacoCommands.COMMON_ACTIONS[action];
            const handler = this.newCommonActionHandler(action);
            registry.registerHandler(command, handler);
        }
    }

    protected newCommonActionHandler(action: string): MonacoEditorCommandHandler {
        return this.isCommonKeyboardAction(action) ? this.newKeyboardHandler(action) : this.newActionHandler(action);
    }

    protected isCommonKeyboardAction(action: string): boolean {
        return MonacoCommands.COMMON_KEYBOARD_ACTIONS.has(action);
    }

    protected registerEditorCommandHandlers(registry: MonacoCommandRegistry): void {
        registry.registerHandler(SHOW_REFERENCES.id, this.newShowReferenceHandler());
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

    protected registerMonacoActionCommands(registry: MonacoCommandRegistry): void {
        for (const action of MonacoCommands.ACTIONS) {
            const handler = this.newMonacoActionHandler(action);
            registry.registerCommand(action, handler);
        }
    }

    protected newMonacoActionHandler(action: MonacoCommand): MonacoEditorCommandHandler {
        const delegate = action.delegate;
        return delegate ? this.newCommandHandler(delegate) : this.newActionHandler(action.id);
    }

    protected newKeyboardHandler(action: string): MonacoEditorCommandHandler {
        return {
            execute: (editor, ...args) => editor.getControl().cursor.trigger('keyboard', action, args)
        };
    }

    protected newCommandHandler(action: string): MonacoEditorCommandHandler {
        return {
            execute: (editor, ...args) => editor.commandService.executeCommand(action, ...args)
        };
    }

    protected newActionHandler(action: string): MonacoEditorCommandHandler {
        return {
            execute: editor => editor.runAction(action),
            isEnabled: editor => editor.isActionSupported(action)
        };
    }

    protected newRegistry(commands: CommandRegistry): MonacoCommandRegistry {
        return new MonacoCommandRegistry(commands, this.editorManager, this.selectionService);
    }

}

export class MonacoCommandRegistry {

    constructor(
        protected readonly commands: CommandRegistry,
        protected readonly editorManager: EditorManager,
        protected readonly selectionService: SelectionService
    ) { }

    registerCommand(command: Command, handler: MonacoEditorCommandHandler): void {
        this.commands.registerCommand(command, this.newHandler(handler));
    }

    registerHandler(command: string, handler: MonacoEditorCommandHandler): void {
        this.commands.registerHandler(command, this.newHandler(handler));
    }

    protected newHandler(monacoHandler: MonacoEditorCommandHandler): CommandHandler {
        return {
            execute: (...args) => this.execute(monacoHandler, ...args),
            isEnabled: (...args) => this.isEnabled(monacoHandler, ...args),
            isVisible: (...args) => this.isVisble(monacoHandler, ...args)
        };
    }

    protected execute(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): any {
        const editor = getCurrent(this.editorManager);
        if (editor) {
            editor.focus();
            return Promise.resolve(monacoHandler.execute(editor, ...args));
        }
        return Promise.resolve();
    }

    protected isEnabled(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        const editor = getCurrent(this.editorManager);
        return !!editor && (!monacoHandler.isEnabled || monacoHandler.isEnabled(editor, ...args));
    }

    protected isVisble(monacoHandler: MonacoEditorCommandHandler, ...args: any[]): boolean {
        return TextEditorSelection.is(this.selectionService.selection);
    }

}

