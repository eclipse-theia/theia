/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication, KeybindingContribution, KeybindingRegistry } from "@theia/core/lib/browser";
import { CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry, Disposable, DisposableCollection } from '@theia/core/lib/common';
import { BlameDecorator } from './blame-decorator';
import { EditorManager, EditorKeybindingContexts, EditorWidget } from '@theia/editor/lib/browser';
import { BlameManager } from './blame-manager';
import URI from '@theia/core/lib/common/uri';
import { EDITOR_CONTEXT_MENU_GIT } from '../git-view-contribution';

import debounce = require('lodash.debounce');

export namespace BlameCommands {
    export const SHOW_GIT_ANNOTATIONS: Command = {
        id: 'git.editor.show.annotations',
        label: 'Git: Show Blame Annotations'
    };
    export const CLEAR_GIT_ANNOTATIONS: Command = {
        id: 'git.editor.clear.annotations'
    };
}

@injectable()
export class BlameContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution, MenuContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(BlameDecorator)
    protected readonly decorator: BlameDecorator;

    @inject(BlameManager)
    protected readonly blameManager: BlameManager;

    onStart(app: FrontendApplication): void {
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(BlameCommands.SHOW_GIT_ANNOTATIONS, {
            execute: () => {
                const editorWidget = this.currentFileEditorWidget;
                if (editorWidget) {
                    this.showBlame(editorWidget);
                }
            },
            isVisible: () =>
                !!this.currentFileEditorWidget,
            isEnabled: () => {
                const editorWidget = this.currentFileEditorWidget;
                return !!editorWidget && this.isBlameable(editorWidget.editor.uri);
            }
        });
        commands.registerCommand(BlameCommands.CLEAR_GIT_ANNOTATIONS, {
            execute: () => {
                const editorWidget = this.currentFileEditorWidget;
                if (editorWidget) {
                    this.clearBlame(editorWidget.editor.uri);
                }
            },
            isVisible: () =>
                !!this.currentFileEditorWidget,
            isEnabled: () => {
                const editorWidget = this.currentFileEditorWidget;
                const enabled = !!editorWidget && this.appliedDecorations.has(editorWidget.editor.uri.toString());
                return enabled;
            }
        });
    }

    protected get currentFileEditorWidget(): EditorWidget | undefined {
        const editorWidget = this.editorManager.currentEditor;
        if (editorWidget) {
            if (editorWidget.editor.uri.scheme === 'file') {
                return editorWidget;
            }
        }
        return undefined;
    }

    protected isBlameable(uri: string | URI): boolean {
        return this.blameManager.isBlameable(uri.toString());
    }

    protected appliedDecorations = new Map<string, Disposable>();

    protected async showBlame(editorWidget: EditorWidget) {
        const uri = editorWidget.editor.uri.toString();
        if (this.appliedDecorations.get(uri)) {
            return;
        }
        const editor = editorWidget.editor;
        const document = editor.document;
        const content = document.dirty ? document.getText() : undefined;
        const blame = await this.blameManager.getBlame(uri, content);
        if (blame) {
            const toDispose = new DisposableCollection();
            this.appliedDecorations.set(uri, toDispose);
            toDispose.push(this.decorator.decorate(blame, editor, editor.cursor.line));
            toDispose.push(editor.onDocumentContentChanged(() => this.clearBlame(uri)));
            toDispose.push(editor.onCursorPositionChanged(debounce(position => {
                if (!toDispose.disposed) {
                    this.decorator.decorate(blame, editor, editor.cursor.line);
                }
            }, 50)));
            editorWidget.disposed.connect(() => this.clearBlame(uri));
        }
    }

    protected clearBlame(uri: string | URI) {
        const decorations = this.appliedDecorations.get(uri.toString());
        if (decorations) {
            this.appliedDecorations.delete(uri.toString());
            decorations.dispose();
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EDITOR_CONTEXT_MENU_GIT, {
            commandId: BlameCommands.SHOW_GIT_ANNOTATIONS.id,
            label: BlameCommands.SHOW_GIT_ANNOTATIONS.label!.slice('Git: '.length)
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: BlameCommands.SHOW_GIT_ANNOTATIONS.id,
            context: EditorKeybindingContexts.editorTextFocus,
            keybinding: 'alt+b'
        });
        keybindings.registerKeybinding({
            command: BlameCommands.CLEAR_GIT_ANNOTATIONS.id,
            context: EditorKeybindingContexts.editorTextFocus,
            keybinding: 'esc'
        });
    }

}
