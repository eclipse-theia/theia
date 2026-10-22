// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandHandler, CommandRegistry, Emitter, nls } from '@theia/core';
import { ApplicationShell, codicon, KeybindingContribution, KeybindingRegistry, Widget, WidgetManager } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { MultiDiffEditor } from './multi-diff-editor';

export namespace MultiDiffEditorCommands {
    export const GO_TO_PREVIOUS_FILE: Command = {
        id: 'multiDiffEditor.goToPreviousFile',
        category: nls.localizeByDefault('Multi Diff Editor'),
        originalCategory: 'Multi Diff Editor',
        label: nls.localize('theia/scm/multiDiffEditor/goToPreviousFile', 'Go to Previous File'),
        originalLabel: 'Go to Previous File',
        iconClass: codicon('chevron-up')
    };
    export const GO_TO_NEXT_FILE: Command = {
        id: 'multiDiffEditor.goToNextFile',
        category: nls.localizeByDefault('Multi Diff Editor'),
        originalCategory: 'Multi Diff Editor',
        label: nls.localize('theia/scm/multiDiffEditor/goToNextFile', 'Go to Next File'),
        originalLabel: 'Go to Next File',
        iconClass: codicon('chevron-down')
    };
    export const GO_TO_PREVIOUS_CHANGE = Command.toDefaultLocalizedCommand({
        id: 'multiDiffEditor.goToPreviousChange',
        category: 'Multi Diff Editor',
        label: 'Go to Previous Change',
        iconClass: codicon('arrow-up')
    });
    export const GO_TO_NEXT_CHANGE = Command.toDefaultLocalizedCommand({
        id: 'multiDiffEditor.goToNextChange',
        category: 'Multi Diff Editor',
        label: 'Go to Next Change',
        iconClass: codicon('arrow-down')
    });
    export const COLLAPSE_ALL = Command.toDefaultLocalizedCommand({
        id: 'multiDiffEditor.collapseAll',
        category: 'Multi Diff Editor',
        label: 'Collapse All Diffs',
        iconClass: codicon('collapse-all')
    });
    export const EXPAND_ALL = Command.toDefaultLocalizedCommand({
        id: 'multiDiffEditor.expandAll',
        category: 'Multi Diff Editor',
        label: 'Expand All Diffs',
        iconClass: codicon('expand-all')
    });
}

/**
 * Context key that is `true` while the focus is in a multi-diff editor, including its embedded editors.
 */
export const MULTI_DIFF_EDITOR_FOCUS = 'multiDiffEditorFocus';

@injectable()
export class MultiDiffEditorContribution implements CommandContribution, KeybindingContribution, TabBarToolbarContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected multiDiffEditorFocus: ContextKey<boolean>;

    protected readonly onDidChangeNavigationStateEmitter = new Emitter<void>();

    @postConstruct()
    protected init(): void {
        this.multiDiffEditorFocus = this.contextKeyService.createKey<boolean>(MULTI_DIFF_EDITOR_FOCUS, false);
        this.shell.onDidChangeActiveWidget(() => this.multiDiffEditorFocus.set(!!this.findMultiDiffEditor(this.shell.activeWidget)));
        this.widgetManager.onDidCreateWidget(({ widget }) => {
            if (widget instanceof MultiDiffEditor) {
                widget.onDidChangeNavigationState(() => this.onDidChangeNavigationStateEmitter.fire());
            }
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(MultiDiffEditorCommands.GO_TO_PREVIOUS_FILE, this.newCommandHandler(
            editor => editor.goToPreviousEntry(),
            editor => editor.hasPreviousEntry()
        ));
        commands.registerCommand(MultiDiffEditorCommands.GO_TO_NEXT_FILE, this.newCommandHandler(
            editor => editor.goToNextEntry(),
            editor => editor.hasNextEntry()
        ));
        commands.registerCommand(MultiDiffEditorCommands.GO_TO_PREVIOUS_CHANGE, this.newCommandHandler(
            editor => editor.goToPreviousChange(),
            editor => editor.hasPreviousChange()
        ));
        commands.registerCommand(MultiDiffEditorCommands.GO_TO_NEXT_CHANGE, this.newCommandHandler(
            editor => editor.goToNextChange(),
            editor => editor.hasNextChange()
        ));
        commands.registerCommand(MultiDiffEditorCommands.COLLAPSE_ALL, this.newCommandHandler(
            editor => editor.collapseAll(),
            editor => editor.entries.length > 0,
            editor => !editor.areAllEntriesCollapsed()
        ));
        commands.registerCommand(MultiDiffEditorCommands.EXPAND_ALL, this.newCommandHandler(
            editor => editor.expandAll(),
            editor => editor.entries.length > 0,
            editor => editor.areAllEntriesCollapsed()
        ));
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: MultiDiffEditorCommands.GO_TO_NEXT_CHANGE.id,
            keybinding: 'alt+f5',
            when: MULTI_DIFF_EDITOR_FOCUS
        });
        keybindings.registerKeybinding({
            command: MultiDiffEditorCommands.GO_TO_PREVIOUS_CHANGE.id,
            keybinding: 'shift+alt+f5',
            when: MULTI_DIFF_EDITOR_FOCUS
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        const commands = [
            MultiDiffEditorCommands.GO_TO_PREVIOUS_FILE,
            MultiDiffEditorCommands.GO_TO_NEXT_FILE,
            MultiDiffEditorCommands.GO_TO_PREVIOUS_CHANGE,
            MultiDiffEditorCommands.GO_TO_NEXT_CHANGE,
            MultiDiffEditorCommands.COLLAPSE_ALL,
            MultiDiffEditorCommands.EXPAND_ALL
        ];
        commands.forEach((command, priority) => registry.registerItem({
            id: command.id,
            command: command.id,
            tooltip: command.label,
            priority,
            onDidChange: this.onDidChangeNavigationStateEmitter.event
        }));
    }

    /**
     * Create a handler that acts on the multi-diff editor of a toolbar, or on the current multi-diff editor
     * when the command runs from a keybinding or the command palette.
     */
    protected newCommandHandler(
        execute: (editor: MultiDiffEditor) => unknown,
        isEnabled: (editor: MultiDiffEditor) => boolean,
        isVisible: (editor: MultiDiffEditor) => boolean = () => true
    ): CommandHandler {
        const getEditor = (widget?: unknown) => this.findMultiDiffEditor(widget instanceof Widget ? widget : this.shell.currentWidget);
        return {
            execute: (widget?: unknown) => {
                const editor = getEditor(widget);
                return editor && isEnabled(editor) ? execute(editor) : undefined;
            },
            isEnabled: (widget?: unknown) => {
                const editor = getEditor(widget);
                return !!editor && isEnabled(editor);
            },
            isVisible: (widget?: unknown) => {
                const editor = getEditor(widget);
                return !!editor && isVisible(editor);
            }
        };
    }

    /**
     * Find the multi-diff editor that is or contains the widget. The shell tracks the embedded editors too,
     * so the current or active widget can be inside a multi-diff editor.
     */
    protected findMultiDiffEditor(widget: Widget | undefined): MultiDiffEditor | undefined {
        for (let current = widget; current; current = current.parent ?? undefined) {
            if (current instanceof MultiDiffEditor) {
                return current;
            }
        }
        return undefined;
    }
}
