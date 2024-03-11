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
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';
import { MonacoEditor, MonacoEditorServices } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { DisposableCollection } from '@theia/core';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { NotebookContextManager } from '../service/notebook-context-manager';
import { NotebookViewportService } from './notebook-viewport-service';

interface CellEditorProps {
    notebookModel: NotebookModel,
    cell: NotebookCellModel,
    monacoServices: MonacoEditorServices,
    notebookContextManager: NotebookContextManager;
    notebookViewportService?: NotebookViewportService
}

const DEFAULT_EDITOR_OPTIONS: MonacoEditor.IOptions = {
    ...MonacoEditorProvider.inlineOptions,
    minHeight: -1,
    maxHeight: -1,
    scrollbar: {
        ...MonacoEditorProvider.inlineOptions.scrollbar,
        alwaysConsumeMouseWheel: false
    }
};

export class CellEditor extends React.Component<CellEditorProps, {}> {

    protected editor?: SimpleMonacoEditor;
    protected toDispose = new DisposableCollection();
    protected container?: HTMLDivElement;

    override componentDidMount(): void {
        this.disposeEditor();
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
    }

    override componentWillUnmount(): void {
        this.disposeEditor();
    }

    protected disposeEditor(): void {
        this.toDispose.dispose();
        this.toDispose = new DisposableCollection();
    }

    protected async initEditor(): Promise<void> {
        const { cell, notebookModel, monacoServices } = this.props;
        if (this.container) {
            const editorNode = this.container;
            const editorModel = await cell.resolveTextModel();
            const uri = cell.uri;
            this.editor = new SimpleMonacoEditor(uri,
                editorModel,
                editorNode,
                monacoServices,
                DEFAULT_EDITOR_OPTIONS,
                [[IContextKeyService, this.props.notebookContextManager.scopedStore]]);
            this.toDispose.push(this.editor);
            this.editor.setLanguage(cell.language);
            this.toDispose.push(this.editor.getControl().onDidContentSizeChange(() => {
                editorNode.style.height = this.editor!.getControl().getContentHeight() + 7 + 'px';
                this.editor!.setSize({ width: -1, height: this.editor!.getControl().getContentHeight() });
            }));
            this.toDispose.push(this.editor.onDocumentContentChanged(e => {
                notebookModel.cellDirtyChanged(cell, true);
            }));
        }
    }

    protected setContainer(component: HTMLDivElement | null): void {
        this.container = component ?? undefined;
    };

    protected handleResize = () => {
        this.editor?.refresh();
    };

    protected estimateHeight(): string {
        return this.props.cell.text.split('\n').length * 20 + 7 + 'px';
    }

    override render(): React.ReactNode {
        return <div className='theia-notebook-cell-editor' onResize={this.handleResize} id={this.props.cell.uri.toString()}
            ref={container => this.setContainer(container)} style={{ height: this.editor ? undefined : this.estimateHeight() }}>
        </div>;
    }

}
