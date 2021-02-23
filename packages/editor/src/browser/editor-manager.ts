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

import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { RecursivePartial, Emitter, Event } from '@theia/core/lib/common';
import { WidgetOpenerOptions, NavigatableWidgetOpenHandler } from '@theia/core/lib/browser';
import { EditorWidget } from './editor-widget';
import { Range, Position, Location } from './editor';
import { EditorWidgetFactory } from './editor-widget-factory';
import { TextEditor } from './editor';

export interface EditorOpenerOptions extends WidgetOpenerOptions {
    selection?: RecursivePartial<Range>;
    preview?: boolean;
}

@injectable()
export class EditorManager extends NavigatableWidgetOpenHandler<EditorWidget> {

    readonly id = EditorWidgetFactory.ID;

    readonly label = 'Code Editor';

    protected readonly onActiveEditorChangedEmitter = new Emitter<EditorWidget | undefined>();
    /**
     * Emit when the active editor is changed.
     */
    readonly onActiveEditorChanged: Event<EditorWidget | undefined> = this.onActiveEditorChangedEmitter.event;

    protected readonly onCurrentEditorChangedEmitter = new Emitter<EditorWidget | undefined>();
    /**
     * Emit when the current editor is changed.
     */
    readonly onCurrentEditorChanged: Event<EditorWidget | undefined> = this.onCurrentEditorChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        super.init();
        this.shell.activeChanged.connect(() => this.updateActiveEditor());
        this.shell.currentChanged.connect(() => this.updateCurrentEditor());
        this.onCreated(widget => {
            widget.onDidChangeVisibility(() => {
                if (widget.isVisible) {
                    this.addRecentlyVisible(widget);
                } else {
                    this.removeRecentlyVisible(widget);
                }
                this.updateCurrentEditor();
            });
            widget.disposed.connect(() => {
                this.removeRecentlyVisible(widget);
                this.updateCurrentEditor();
            });
        });
        for (const widget of this.all) {
            if (widget.isVisible) {
                this.addRecentlyVisible(widget);
            }
        }
        this.updateCurrentEditor();
    }

    async getByUri(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        const widget = await super.getByUri(uri);
        if (widget) {
            // Reveal selection before attachment to manage nav stack. (https://github.com/eclipse-theia/theia/issues/8955)
            this.revealSelection(widget, options, uri);
        }
        return widget;
    }

    async getOrCreateByUri(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const widget = await super.getOrCreateByUri(uri);
        if (widget) {
            // Reveal selection before attachment to manage nav stack. (https://github.com/eclipse-theia/theia/issues/8955)
            this.revealSelection(widget, options, uri);
        }
        return widget;
    }

    protected readonly recentlyVisibleIds: string[] = [];
    protected get recentlyVisible(): EditorWidget | undefined {
        const id = this.recentlyVisibleIds[0];
        return id && this.all.find(w => w.id === id) || undefined;
    }
    protected addRecentlyVisible(widget: EditorWidget): void {
        this.removeRecentlyVisible(widget);
        this.recentlyVisibleIds.unshift(widget.id);
    }
    protected removeRecentlyVisible(widget: EditorWidget): void {
        const index = this.recentlyVisibleIds.indexOf(widget.id);
        if (index !== -1) {
            this.recentlyVisibleIds.splice(index, 1);
        }
    }

    protected _activeEditor: EditorWidget | undefined;
    /**
     * The active editor.
     * If there is an active editor (one that has focus), active and current are the same.
     */
    get activeEditor(): EditorWidget | undefined {
        return this._activeEditor;
    }
    protected setActiveEditor(active: EditorWidget | undefined): void {
        if (this._activeEditor !== active) {
            this._activeEditor = active;
            this.onActiveEditorChangedEmitter.fire(this._activeEditor);
        }
    }
    protected updateActiveEditor(): void {
        const widget = this.shell.activeWidget;
        this.setActiveEditor(widget instanceof EditorWidget ? widget : undefined);
    }

    protected _currentEditor: EditorWidget | undefined;
    /**
     * The most recently activated editor (which might not have the focus anymore, hence it is not active).
     * If no editor has focus, e.g. when a context menu is shown, the active editor is `undefined`, but current might be the editor that was active before the menu popped up.
     */
    get currentEditor(): EditorWidget | undefined {
        return this._currentEditor;
    }
    protected setCurrentEditor(current: EditorWidget | undefined): void {
        if (this._currentEditor !== current) {
            this._currentEditor = current;
            this.onCurrentEditorChangedEmitter.fire(this._currentEditor);
        }
    }
    protected updateCurrentEditor(): void {
        const widget = this.shell.currentWidget;
        if (widget instanceof EditorWidget) {
            this.setCurrentEditor(widget);
        } else if (!this._currentEditor || !this._currentEditor.isVisible || this.currentEditor !== this.recentlyVisible) {
            this.setCurrentEditor(this.recentlyVisible);
        }
    }

    canHandle(uri: URI, options?: WidgetOpenerOptions): number {
        return 100;
    }

    async open(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const editor = await this.getOrCreateByUri(uri, options);
        await super.open(uri, options);
        return editor;
    }

    protected revealSelection(widget: EditorWidget, input?: EditorOpenerOptions, uri?: URI): void {
        let inputSelection = input && input.selection;
        if (!inputSelection && uri) {
            const match = /^L?(\d+)(?:,(\d+))?/.exec(uri.fragment);
            if (match) {
                // support file:///some/file.js#73,84
                // support file:///some/file.js#L73
                inputSelection = {
                    start: {
                        line: parseInt(match[1]) - 1,
                        character: match[2] ? parseInt(match[2]) - 1 : 0
                    }
                };
            }
        }
        if (inputSelection) {
            const editor = widget.editor;
            const selection = this.getSelection(widget, inputSelection);
            if (Position.is(selection)) {
                editor.cursor = selection;
                editor.revealPosition(selection);
            } else if (Range.is(selection)) {
                editor.cursor = selection.end;
                editor.selection = selection;
                editor.revealRange(selection);
            }
        }
    }

    protected getSelection(widget: EditorWidget, selection: RecursivePartial<Range>): Range | Position | undefined {
        const { start, end } = selection;
        const line = start && start.line !== undefined && start.line >= 0 ? start.line : undefined;
        if (line === undefined) {
            return undefined;
        }
        const character = start && start.character !== undefined && start.character >= 0 ? start.character : widget.editor.document.getLineMaxColumn(line);
        const endLine = end && end.line !== undefined && end.line >= 0 ? end.line : undefined;
        if (endLine === undefined) {
            return { line, character };
        }
        const endCharacter = end && end.character !== undefined && end.character >= 0 ? end.character : widget.editor.document.getLineMaxColumn(endLine);
        return {
            start: { line, character },
            end: { line: endLine, character: endCharacter }
        };
    }

}

/**
 * Provides direct access to the underlying text editor.
 */
@injectable()
export abstract class EditorAccess {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    /**
     * The URI of the underlying document from the editor.
     */
    get uri(): string | undefined {
        const editor = this.editor;
        if (editor) {
            return editor.uri.toString();
        }
        return undefined;
    }

    /**
     * The selection location from the text editor.
     */
    get selection(): Location | undefined {
        const editor = this.editor;
        if (editor) {
            const uri = editor.uri.toString();
            const range = editor.selection;
            return {
                range,
                uri
            };
        }
        return undefined;
    }

    /**
     * The unique identifier of the language the current editor belongs to.
     */
    get languageId(): string | undefined {
        const editor = this.editor;
        if (editor) {
            return editor.document.languageId;
        }
        return undefined;
    }

    /**
     * The text editor.
     */
    get editor(): TextEditor | undefined {
        const editorWidget = this.editorWidget();
        if (editorWidget) {
            return editorWidget.editor;
        }
        return undefined;
    }

    /**
     * The editor widget, or `undefined` if not applicable.
     */
    protected abstract editorWidget(): EditorWidget | undefined;

}

/**
 * Provides direct access to the currently active text editor.
 */
@injectable()
export class CurrentEditorAccess extends EditorAccess {

    protected editorWidget(): EditorWidget | undefined {
        return this.editorManager.currentEditor;
    }

}

/**
 * Provides access to the active text editor.
 */
@injectable()
export class ActiveEditorAccess extends EditorAccess {

    protected editorWidget(): EditorWidget | undefined {
        return this.editorManager.activeEditor;
    }

}

export namespace EditorAccess {
    export const CURRENT = 'current-editor-access';
    export const ACTIVE = 'active-editor-access';
}
