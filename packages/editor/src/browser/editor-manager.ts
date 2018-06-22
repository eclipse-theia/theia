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

import { injectable, postConstruct, } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { RecursivePartial, Emitter, Event } from '@theia/core/lib/common';
import { WidgetOpenHandler, WidgetOpenerOptions } from "@theia/core/lib/browser";
import { EditorWidget } from "./editor-widget";
import { Range, Position } from "./editor";
import { EditorWidgetFactory } from "./editor-widget-factory";

export interface EditorOpenerOptions extends WidgetOpenerOptions {
    selection?: RecursivePartial<Range>;
}

@injectable()
export class EditorManager extends WidgetOpenHandler<EditorWidget> {

    readonly id = EditorWidgetFactory.ID;

    readonly label = "Code Editor";

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
        this.onCreated(widget => widget.disposed.connect(() => this.updateCurrentEditor()));
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
        } else if (!this._currentEditor || !this._currentEditor.isVisible) {
            this.setCurrentEditor(undefined);
        }
    }

    canHandle(uri: URI, options?: WidgetOpenerOptions): number {
        return 100;
    }

    async open(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const editor = await super.open(uri, options);
        this.revealSelection(editor, options);
        return editor;
    }

    protected revealSelection(widget: EditorWidget, input?: EditorOpenerOptions): void {
        if (input && input.selection) {
            const editor = widget.editor;
            const selection = this.getSelection(input.selection);
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

    protected getSelection(selection: RecursivePartial<Range>): Range | Position | undefined {
        const { start, end } = selection;
        if (start && start.line !== undefined && start.line >= 0 &&
            start.character !== undefined && start.character >= 0) {
            if (end && end.line !== undefined && end.line >= 0 &&
                end.character !== undefined && end.character >= 0) {
                return selection as Range;
            }
            return start as Position;
        }
        return undefined;
    }

}
