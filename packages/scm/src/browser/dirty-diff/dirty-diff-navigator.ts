// *****************************************************************************
// Copyright (C) 2023 1C-Soft LLC and others.
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
import { Disposable, DisposableCollection, URI } from '@theia/core';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { EditorManager, EditorMouseEvent, MouseTargetType, TextEditor } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { Change, LineRange } from './diff-computer';
import { DirtyDiffUpdate } from './dirty-diff-decorator';
import { DirtyDiffWidget, DirtyDiffWidgetFactory } from './dirty-diff-widget';

@injectable()
export class DirtyDiffNavigator {

    protected readonly controllers = new Map<TextEditor, DirtyDiffController>();

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(DirtyDiffWidgetFactory)
    protected readonly widgetFactory: DirtyDiffWidgetFactory;

    @postConstruct()
    protected init(): void {
        const dirtyDiffVisible: ContextKey<boolean> = this.contextKeyService.createKey('dirtyDiffVisible', false);
        this.editorManager.onActiveEditorChanged(editorWidget => {
            dirtyDiffVisible.set(editorWidget && this.controllers.get(editorWidget.editor)?.isShowingChange());
        });
        this.editorManager.onCreated(editorWidget => {
            const { editor } = editorWidget;
            if (editor.uri.scheme !== 'file') {
                return;
            }
            const controller = this.createController(editor);
            controller.widgetFactory = props => {
                const widget = this.widgetFactory(props);
                if (widget.editor === this.editorManager.activeEditor?.editor) {
                    dirtyDiffVisible.set(true);
                }
                widget.onDidClose(() => {
                    if (widget.editor === this.editorManager.activeEditor?.editor) {
                        dirtyDiffVisible.set(false);
                    }
                });
                return widget;
            };
            this.controllers.set(editor, controller);
            editorWidget.disposed.connect(() => {
                this.controllers.delete(editor);
                controller.dispose();
            });
        });
    }

    handleDirtyDiffUpdate(update: DirtyDiffUpdate): void {
        const controller = this.controllers.get(update.editor);
        controller?.handleDirtyDiffUpdate(update);
    }

    canNavigate(): boolean {
        return !!this.activeController?.canNavigate();
    }

    gotoNextChange(): void {
        this.activeController?.gotoNextChange();
    }

    gotoPreviousChange(): void {
        this.activeController?.gotoPreviousChange();
    }

    canShowChange(): boolean {
        return !!this.activeController?.canShowChange();
    }

    showNextChange(): void {
        this.activeController?.showNextChange();
    }

    showPreviousChange(): void {
        this.activeController?.showPreviousChange();
    }

    isShowingChange(): boolean {
        return !!this.activeController?.isShowingChange();
    }

    closeChangePeekView(): void {
        this.activeController?.closeWidget();
    }

    protected get activeController(): DirtyDiffController | undefined {
        const editor = this.editorManager.activeEditor?.editor;
        return editor && this.controllers.get(editor);
    }

    protected createController(editor: TextEditor): DirtyDiffController {
        return new DirtyDiffController(editor);
    }
}

export class DirtyDiffController implements Disposable {

    protected readonly toDispose = new DisposableCollection();

    widgetFactory?: DirtyDiffWidgetFactory;
    protected widget?: DirtyDiffWidget;
    protected dirtyDiff?: DirtyDiffUpdate;

    constructor(protected readonly editor: TextEditor) {
        editor.onMouseDown(this.handleEditorMouseDown, this, this.toDispose);
    }

    dispose(): void {
        this.closeWidget();
        this.toDispose.dispose();
    }

    handleDirtyDiffUpdate(dirtyDiff: DirtyDiffUpdate): void {
        if (dirtyDiff.editor === this.editor) {
            this.closeWidget();
            this.dirtyDiff = dirtyDiff;
        }
    }

    canNavigate(): boolean {
        return !!this.changes?.length;
    }

    gotoNextChange(): void {
        const { editor } = this;
        const index = this.findNextClosestChange(editor.cursor.line, false);
        const change = this.changes?.[index];
        if (change) {
            const position = LineRange.getStartPosition(change.currentRange);
            editor.cursor = position;
            editor.revealPosition(position, { vertical: 'auto' });
        }
    }

    gotoPreviousChange(): void {
        const { editor } = this;
        const index = this.findPreviousClosestChange(editor.cursor.line, false);
        const change = this.changes?.[index];
        if (change) {
            const position = LineRange.getStartPosition(change.currentRange);
            editor.cursor = position;
            editor.revealPosition(position, { vertical: 'auto' });
        }
    }

    canShowChange(): boolean {
        return !!(this.widget || this.widgetFactory && this.editor instanceof MonacoEditor && this.changes?.length && this.previousRevisionUri);
    }

    showNextChange(): void {
        if (this.widget) {
            this.widget.showNextChange();
        } else {
            (this.widget = this.createWidget())?.showChange(
                this.findNextClosestChange(this.editor.cursor.line, true));
        }
    }

    showPreviousChange(): void {
        if (this.widget) {
            this.widget.showPreviousChange();
        } else {
            (this.widget = this.createWidget())?.showChange(
                this.findPreviousClosestChange(this.editor.cursor.line, true));
        }
    }

    isShowingChange(): boolean {
        return !!this.widget;
    }

    closeWidget(): void {
        if (this.widget) {
            this.widget.dispose();
            this.widget = undefined;
        }
    }

    protected get changes(): readonly Change[] | undefined {
        return this.dirtyDiff?.changes;
    }

    protected get previousRevisionUri(): URI | undefined {
        return this.dirtyDiff?.previousRevisionUri;
    }

    protected createWidget(): DirtyDiffWidget | undefined {
        const { widgetFactory, editor, changes, previousRevisionUri } = this;
        if (widgetFactory && editor instanceof MonacoEditor && changes?.length && previousRevisionUri) {
            const widget = widgetFactory({ editor, previousRevisionUri, changes });
            widget.onDidClose(() => {
                this.widget = undefined;
            });
            return widget;
        }
    }

    protected findNextClosestChange(line: number, inclusive: boolean): number {
        const length = this.changes?.length;
        if (!length) {
            return -1;
        }
        for (let i = 0; i < length; i++) {
            const { currentRange } = this.changes![i];

            if (inclusive) {
                if (LineRange.getEndPosition(currentRange).line >= line) {
                    return i;
                }
            } else {
                if (LineRange.getStartPosition(currentRange).line > line) {
                    return i;
                }
            }
        }
        return 0;
    }

    protected findPreviousClosestChange(line: number, inclusive: boolean): number {
        const length = this.changes?.length;
        if (!length) {
            return -1;
        }
        for (let i = length - 1; i >= 0; i--) {
            const { currentRange } = this.changes![i];

            if (inclusive) {
                if (LineRange.getStartPosition(currentRange).line <= line) {
                    return i;
                }
            } else {
                if (LineRange.getEndPosition(currentRange).line < line) {
                    return i;
                }
            }
        }
        return length - 1;
    }

    protected handleEditorMouseDown({ event, target }: EditorMouseEvent): void {
        if (event.button !== 0) {
            return;
        }
        const { range, type, element } = target;
        if (!range || type !== MouseTargetType.GUTTER_LINE_DECORATIONS || !element || element.className.indexOf('dirty-diff-glyph') < 0) {
            return;
        }
        const gutterOffsetX = target.detail.offsetX - (element as HTMLElement).offsetLeft;
        if (gutterOffsetX < -3 || gutterOffsetX > 3) { // dirty diff decoration on hover is 6px wide
            return; // to avoid colliding with folding
        }
        const index = this.findNextClosestChange(range.start.line, true);
        if (index < 0) {
            return;
        }
        if (index === this.widget?.currentChangeIndex) {
            this.closeWidget();
            return;
        }
        if (!this.widget) {
            this.widget = this.createWidget();
        }
        this.widget?.showChange(index);
    }
}
