/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ProtocolToMonacoConverter } from "monaco-languageclient/lib";
import { Command, CommandContribution } from '@theia/core';
import { Position, Location } from "@theia/languages/lib/common";
import { CommonCommands } from '@theia/core/lib/browser';
import { EditorCommands } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';
import { MonacoCommandRegistry, MonacoEditorCommandHandler } from './monaco-command-registry';
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

    export const ACTIONS: MonacoCommand[] = [
        { id: SELECTION_SELECT_ALL, label: 'Select All', delegate: 'editor.action.selectAll' }
    ];
    export const EXCLUDE_ACTIONS = new Set([
        ...Object.keys(COMMON_ACTIONS),
        'editor.action.quickCommand',
        'editor.action.clipboardCutAction',
        'editor.action.clipboardCopyAction',
        'editor.action.clipboardPasteAction',
        'editor.action.goToImplementation',
        'editor.action.toggleTabFocusMode',
        'find.history.showNext',
        'find.history.showPrevious',
    ]);
    const iconClasses = new Map<string, string>();
    for (const menuItem of MenuRegistry.getMenuItems(MenuId.EditorContext)) {
        if (menuItem.command.iconClass) {
            iconClasses.set(menuItem.command.id, menuItem.command.iconClass);
        }
    }
    for (const command of monaco.editorCommonExtensions.CommonEditorRegistry.getEditorActions()) {
        const id = command.id;
        if (!EXCLUDE_ACTIONS.has(id)) {
            const label = command.label;
            const iconClass = iconClasses.get(id);
            ACTIONS.push({ id, label, iconClass });
        }
    }
}

@injectable()
export class MonacoEditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(MonacoCommandRegistry) protected readonly registry: MonacoCommandRegistry,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter
    ) { }

    registerCommands(): void {
        this.registerCommonCommandHandlers();
        this.registerEditorCommandHandlers();
        this.registerMonacoActionCommands();
    }

    protected registerCommonCommandHandlers(): void {
        // tslint:disable-next-line:forin
        for (const action in MonacoCommands.COMMON_ACTIONS) {
            const command = MonacoCommands.COMMON_ACTIONS[action];
            const handler = this.newCommonActionHandler(action);
            this.registry.registerHandler(command, handler);
        }
    }
    protected newCommonActionHandler(action: string): MonacoEditorCommandHandler {
        return this.isCommonKeyboardAction(action) ? this.newKeyboardHandler(action) : this.newActionHandler(action);
    }
    protected isCommonKeyboardAction(action: string): boolean {
        return MonacoCommands.COMMON_KEYBOARD_ACTIONS.has(action);
    }

    protected registerEditorCommandHandlers(): void {
        this.registry.registerHandler(EditorCommands.SHOW_REFERENCES.id, this.newShowReferenceHandler());
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

    protected registerMonacoActionCommands(): void {
        for (const action of MonacoCommands.ACTIONS) {
            const handler = this.newMonacoActionHandler(action);
            this.registry.registerCommand(action, handler);
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

}
