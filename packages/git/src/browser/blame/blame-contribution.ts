// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry, DisposableCollection } from '@theia/core/lib/common';
import { BlameDecorator } from './blame-decorator';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { BlameManager } from './blame-manager';
import URI from '@theia/core/lib/common/uri';
import { EDITOR_CONTEXT_MENU_SCM } from '@theia/scm-extra/lib/browser/scm-extra-contribution';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';

import debounce = require('@theia/core/shared/lodash.debounce');

export namespace BlameCommands {
    export const TOGGLE_GIT_ANNOTATIONS = Command.toLocalizedCommand({
        id: 'git.editor.toggle.annotations',
        category: 'Git',
        label: 'Toggle Blame Annotations'
    }, 'theia/git/toggleBlameAnnotations', 'vscode.git/package/displayName');
    export const CLEAR_GIT_ANNOTATIONS: Command = {
        id: 'git.editor.clear.annotations'
    };
}

@injectable()
export class BlameContribution implements CommandContribution, KeybindingContribution, MenuContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(BlameDecorator)
    protected readonly decorator: BlameDecorator;

    @inject(BlameManager)
    protected readonly blameManager: BlameManager;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected _visibleBlameAnnotations: ContextKey<boolean>;

    @postConstruct()
    protected init(): void {
        this._visibleBlameAnnotations = this.contextKeyService.createKey<boolean>('showsBlameAnnotations', this.visibleBlameAnnotations());
        this.editorManager.onActiveEditorChanged(() => this.updateContext());
    }

    protected updateContext(): void {
        this._visibleBlameAnnotations.set(this.visibleBlameAnnotations());
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(BlameCommands.TOGGLE_GIT_ANNOTATIONS, {
            execute: () => {
                const editorWidget = this.currentFileEditorWidget;
                if (editorWidget) {
                    if (this.showsBlameAnnotations(editorWidget.editor.uri)) {
                        this.clearBlame(editorWidget.editor.uri);
                    } else {
                        this.showBlame(editorWidget);
                    }
                }
            },
            isVisible: () => !!this.currentFileEditorWidget,
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
            isVisible: () => !!this.currentFileEditorWidget,
            isEnabled: () => {
                const editorWidget = this.currentFileEditorWidget;
                const enabled = !!editorWidget && this.showsBlameAnnotations(editorWidget.editor.uri);
                return enabled;
            }
        });
    }

    showsBlameAnnotations(uri: string | URI): boolean {
        return this.appliedDecorations.get(uri.toString())?.disposed === false;
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

    protected visibleBlameAnnotations(): boolean {
        const widget = this.editorManager.activeEditor;
        if (widget && widget.editor.isFocused() && this.showsBlameAnnotations(widget.editor.uri)) {
            return true;
        }
        return false;
    }

    protected appliedDecorations = new Map<string, DisposableCollection>();

    protected async showBlame(editorWidget: EditorWidget): Promise<void> {
        const uri = editorWidget.editor.uri.toString();
        if (this.appliedDecorations.get(uri)) {
            return;
        }
        const toDispose = new DisposableCollection();
        this.appliedDecorations.set(uri, toDispose);
        try {
            const editor = editorWidget.editor;
            const document = editor.document;
            const content = document.dirty ? document.getText() : undefined;
            const blame = await this.blameManager.getBlame(uri, content);
            if (blame) {
                toDispose.push(this.decorator.decorate(blame, editor, editor.cursor.line));
                toDispose.push(editor.onDocumentContentChanged(() => this.clearBlame(uri)));
                toDispose.push(editor.onCursorPositionChanged(debounce(_position => {
                    if (!toDispose.disposed) {
                        this.decorator.decorate(blame, editor, editor.cursor.line);
                    }
                }, 50)));
                editorWidget.disposed.connect(() => this.clearBlame(uri));
            }
        } finally {
            if (toDispose.disposed) {
                this.appliedDecorations.delete(uri);
            };
            this.updateContext();
        }
    }

    protected clearBlame(uri: string | URI): void {
        const decorations = this.appliedDecorations.get(uri.toString());
        if (decorations) {
            this.appliedDecorations.delete(uri.toString());
            decorations.dispose();
            this.updateContext();
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EDITOR_CONTEXT_MENU_SCM, {
            commandId: BlameCommands.TOGGLE_GIT_ANNOTATIONS.id,
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: BlameCommands.TOGGLE_GIT_ANNOTATIONS.id,
            when: 'editorTextFocus',
            keybinding: 'alt+b'
        });
        keybindings.registerKeybinding({
            command: BlameCommands.CLEAR_GIT_ANNOTATIONS.id,
            when: 'showsBlameAnnotations',
            keybinding: 'esc'
        });
    }

}
