// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import * as React from '@theia/core/shared/react';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellModel, NotebookCodeEditorFindMatch } from '../view-model/notebook-cell-model';
import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';
import { MonacoEditor, MonacoEditorServices } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { NotebookContextManager } from '../service/notebook-context-manager';
import { DisposableCollection, OS } from '@theia/core';
import { NotebookViewportService } from './notebook-viewport-service';
import { BareFontInfo } from '@theia/monaco-editor-core/esm/vs/editor/common/config/fontInfo';
import { NOTEBOOK_CELL_CURSOR_FIRST_LINE, NOTEBOOK_CELL_CURSOR_LAST_LINE } from '../contributions/notebook-context-keys';
import { EditorExtensionsRegistry } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorExtensions';
import { ModelDecorationOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/model/textModel';
import { IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { animationFrame } from '@theia/core/lib/browser';
import { NotebookCellEditorService } from '../service/notebook-cell-editor-service';

interface CellEditorProps {
    notebookModel: NotebookModel;
    cell: NotebookCellModel;
    monacoServices: MonacoEditorServices;
    notebookContextManager: NotebookContextManager;
    notebookCellEditorService: NotebookCellEditorService;
    notebookViewportService?: NotebookViewportService;
    fontInfo?: BareFontInfo;
}

const DEFAULT_EDITOR_OPTIONS: MonacoEditor.IOptions = {
    ...MonacoEditorProvider.inlineOptions,
    minHeight: -1,
    maxHeight: -1,
    scrollbar: {
        ...MonacoEditorProvider.inlineOptions.scrollbar,
        alwaysConsumeMouseWheel: false
    },
    lineDecorationsWidth: 10,
};

export const CURRENT_FIND_MATCH_DECORATION = ModelDecorationOptions.register({
    description: 'current-find-match',
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    zIndex: 13,
    className: 'currentFindMatch',
    inlineClassName: 'currentFindMatchInline',
    showIfCollapsed: true,
    overviewRuler: {
        color: 'editorOverviewRuler.findMatchForeground',
        position: OverviewRulerLane.Center
    }
});

export const FIND_MATCH_DECORATION = ModelDecorationOptions.register({
    description: 'find-match',
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    zIndex: 10,
    className: 'findMatch',
    inlineClassName: 'findMatchInline',
    showIfCollapsed: true,
    overviewRuler: {
        color: 'editorOverviewRuler.findMatchForeground',
        position: OverviewRulerLane.Center
    }
});

export class CellEditor extends React.Component<CellEditorProps, {}> {

    protected editor?: SimpleMonacoEditor;
    protected toDispose = new DisposableCollection();
    protected container?: HTMLDivElement;
    protected matches: NotebookCodeEditorFindMatch[] = [];
    protected oldMatchDecorations: string[] = [];

    override componentDidMount(): void {
        this.disposeEditor();
        this.toDispose.push(this.props.cell.onWillFocusCellEditor(focusRequest => {
            this.editor?.getControl().focus();
            const lineCount = this.editor?.getControl().getModel()?.getLineCount();
            if (focusRequest && lineCount !== undefined) {
                this.editor?.getControl().setPosition(focusRequest === 'lastLine' ?
                    { lineNumber: lineCount, column: 1 } :
                    { lineNumber: focusRequest, column: 1 },
                    'keyboard');
            }
            const currentLine = this.editor?.getControl().getPosition()?.lineNumber;
            this.props.notebookContextManager.scopedStore.setContext(NOTEBOOK_CELL_CURSOR_FIRST_LINE, currentLine === 1);
            this.props.notebookContextManager.scopedStore.setContext(NOTEBOOK_CELL_CURSOR_LAST_LINE, currentLine === lineCount);
        }));

        this.toDispose.push(this.props.cell.onWillBlurCellEditor(() => this.blurEditor()));

        this.toDispose.push(this.props.cell.onDidChangeEditorOptions(options => {
            this.editor?.getControl().updateOptions(options);
        }));

        this.toDispose.push(this.props.cell.onDidChangeLanguage(language => {
            this.editor?.setLanguage(language);
        }));

        this.toDispose.push(this.props.cell.onDidFindMatches(matches => {
            this.matches = matches;
            animationFrame().then(() => this.setMatches());
        }));

        this.toDispose.push(this.props.cell.onDidSelectFindMatch(match => this.centerEditorInView()));

        this.toDispose.push(this.props.notebookModel.onDidChangeSelectedCell(e => {
            if (e.cell !== this.props.cell && this.editor?.getControl().hasTextFocus()) {
                this.blurEditor();
            }
        }));
        if (!this.props.notebookViewportService || (this.container && this.props.notebookViewportService.isElementInViewport(this.container))) {
            this.initEditor();
        } else {
            const disposable = this.props.notebookViewportService?.onDidChangeViewport(() => {
                if (!this.editor && this.container && this.props.notebookViewportService!.isElementInViewport(this.container)) {
                    this.initEditor();
                    disposable.dispose();
                }
            });
            this.toDispose.push(disposable);
        }

        this.toDispose.push(this.props.cell.onDidRequestCenterEditor(() => {
            this.centerEditorInView();
        }));
    }

    override componentWillUnmount(): void {
        this.disposeEditor();
    }

    protected disposeEditor(): void {
        if (this.editor) {
            this.props.notebookCellEditorService.editorDisposed(this.editor.uri);
        }
        this.toDispose.dispose();
        this.toDispose = new DisposableCollection();
    }

    protected centerEditorInView(): void {
        const editorDomNode = this.editor?.getControl().getDomNode();
        if (editorDomNode) {
            editorDomNode.scrollIntoView({
                behavior: 'instant',
                block: 'center'
            });
        } else {
            this.container?.scrollIntoView({
                behavior: 'instant',
                block: 'center'
            });
        }
    }

    protected async initEditor(): Promise<void> {
        const { cell, notebookModel, monacoServices } = this.props;
        if (this.container) {
            const editorNode = this.container;
            editorNode.style.height = '';
            const editorModel = await cell.resolveTextModel();
            const uri = cell.uri;
            this.editor = new SimpleMonacoEditor(uri,
                editorModel,
                editorNode,
                monacoServices,
                { ...DEFAULT_EDITOR_OPTIONS, ...cell.editorOptions },
                [[IContextKeyService, this.props.notebookContextManager.scopedStore]],
                { contributions: EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== 'editor.contrib.findController') });
            this.toDispose.push(this.editor);
            this.editor.setLanguage(cell.language);
            this.toDispose.push(this.editor.getControl().onDidContentSizeChange(() => {
                editorNode.style.height = this.editor!.getControl().getContentHeight() + 7 + 'px';
                this.editor!.setSize({ width: -1, height: this.editor!.getControl().getContentHeight() });
            }));
            this.toDispose.push(this.editor.onDocumentContentChanged(e => {
                notebookModel.cellDirtyChanged(cell, true);
            }));
            this.toDispose.push(this.editor.getControl().onDidFocusEditorText(() => {
                this.props.notebookModel.setSelectedCell(cell, false);
                this.props.notebookCellEditorService.editorFocusChanged(this.editor);
            }));
            this.toDispose.push(this.editor.getControl().onDidBlurEditorText(() => {
                if (this.props.notebookCellEditorService.getActiveCell()?.uri.toString() === this.props.cell.uri.toString()) {
                    this.props.notebookCellEditorService.editorFocusChanged(undefined);
                }
            }));

            this.toDispose.push(this.editor.getControl().onDidChangeCursorSelection(e => {
                const selectedText = this.editor!.getControl().getModel()!.getValueInRange(e.selection);
                // TODO handle secondary selections
                this.props.cell.selection = {
                    start: { line: e.selection.startLineNumber - 1, character: e.selection.startColumn - 1 },
                    end: { line: e.selection.endLineNumber - 1, character: e.selection.endColumn - 1 }
                };
                this.props.notebookModel.selectedText = selectedText;
            }));
            this.toDispose.push(this.editor.getControl().onDidChangeCursorPosition(e => {
                if (e.secondaryPositions.length === 0) {
                    this.props.notebookContextManager.scopedStore.setContext(NOTEBOOK_CELL_CURSOR_FIRST_LINE, e.position.lineNumber === 1);
                    this.props.notebookContextManager.scopedStore.setContext(NOTEBOOK_CELL_CURSOR_LAST_LINE,
                        e.position.lineNumber === this.editor!.getControl().getModel()!.getLineCount());
                } else {
                    this.props.notebookContextManager.scopedStore.setContext(NOTEBOOK_CELL_CURSOR_FIRST_LINE, false);
                    this.props.notebookContextManager.scopedStore.setContext(NOTEBOOK_CELL_CURSOR_LAST_LINE, false);
                }
            }));
            this.props.notebookCellEditorService.editorCreated(uri, this.editor);
            this.setMatches();
            if (notebookModel.selectedCell === cell) {
                this.editor.getControl().focus();
            }
        }
    }

    protected setMatches(): void {
        if (!this.editor) {
            return;
        }
        const decorations: IModelDeltaDecoration[] = [];
        for (const match of this.matches) {
            const decoration = match.selected ? CURRENT_FIND_MATCH_DECORATION : FIND_MATCH_DECORATION;
            decorations.push({
                range: {
                    startLineNumber: match.range.start.line,
                    startColumn: match.range.start.character,
                    endLineNumber: match.range.end.line,
                    endColumn: match.range.end.character
                },
                options: decoration
            });
        }

        this.oldMatchDecorations = this.editor.getControl()
            .changeDecorations(accessor => accessor.deltaDecorations(this.oldMatchDecorations, decorations));
    }

    protected setContainer(component: HTMLDivElement | null): void {
        this.container = component ?? undefined;
    };

    protected handleResize = () => {
        this.editor?.refresh();
    };

    protected estimateHeight(): string {
        const lineHeight = this.props.fontInfo?.lineHeight ?? 20;
        return this.props.cell.text.split(OS.backend.EOL).length * lineHeight + 10 + 7 + 'px';
    }

    override render(): React.ReactNode {
        return <div className='theia-notebook-cell-editor' onResize={this.handleResize} id={this.props.cell.uri.toString()}
            ref={container => this.setContainer(container)} style={{ height: this.editor ? undefined : this.estimateHeight() }}>
        </div >;
    }

    protected blurEditor(): void {
        let parent = this.container?.parentElement;
        while (parent && !parent.classList.contains('theia-notebook-cell')) {
            parent = parent.parentElement;
        }
        if (parent) {
            parent.focus();
        }
    }

}
