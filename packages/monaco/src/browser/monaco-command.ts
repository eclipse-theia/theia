/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ProtocolToMonacoConverter } from "monaco-languageclient/lib";
import { Position, Location } from "@theia/languages/lib/common";
import { CommonCommands } from '@theia/core/lib/browser';
import { EditorManager, TextEditorSelection, SHOW_REFERENCES } from '@theia/editor/lib/browser';
import { CommandHandler, CommandContribution, CommandRegistry, SelectionService } from '@theia/core/lib/common';
import { getCurrent, MonacoEditor } from './monaco-editor';
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;

/**
 * Editor commands (and actions) for the `Selection` menu contribution.
 */
export namespace MonacoSelectionCommands {

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
    export const ACTIONS: { id: string, label: string, delegateId?: string }[] = [
        { id: SELECTION_SELECT_ALL, label: 'Select All', delegateId: 'editor.action.selectAll' },
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

}

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
            const doExecute = (editor: MonacoEditor, ...args: any[]): any => editor.getControl().cursor.trigger('keyboard', id, args);
            const handler = this.newClipboardHandler(id, doExecute);
            commands.registerHandler(id, handler);
        });

        [CommonCommands.EDIT_FIND, CommonCommands.EDIT_REPLACE, ...MonacoSelectionCommands.ACTIONS.filter(action => !action.delegateId).map(({ id }) => id)].forEach(id => {
            commands.registerHandler(id, this.newHandler(id));
        });

        // VSCode registers some commands as core commands and not as @editorAction. These have to be treated differently.
        MonacoSelectionCommands.ACTIONS.forEach(action => {
            if (action.delegateId) {
                const { id, delegateId } = action;
                commands.registerHandler(id, {
                    execute: () => {
                        const editor = getCurrent(this.editorManager);
                        if (editor) {
                            if (editor) {
                                editor.focus();
                                editor.commandService.executeCommand(delegateId!);
                            }
                        }
                    },
                    isEnabled: () => !!getCurrent(this.editorManager)
                });
            }
        });

        for (const menuItem of MenuRegistry.getMenuItems(MenuId.EditorContext)) {
            const { id, title, iconClass } = menuItem.command;
            if ([CommonCommands.EDIT_CUT, CommonCommands.EDIT_COPY, CommonCommands.EDIT_PASTE].indexOf(id) === -1) {
                commands.registerCommand({
                    id,
                    iconClass,
                    label: title
                }, this.newHandler(id));
            } else {
                // The command is already defined for Cut/Copy/Paste in the core, we need only the handler for the editor.
                commands.registerHandler(id, this.newHandler(id));
            }
        }

        MonacoSelectionCommands.ACTIONS.forEach(entry => {
            const { id, label } = entry;
            commands.registerCommand({
                id,
                label
            });
        });

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
            editor.focus();
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
