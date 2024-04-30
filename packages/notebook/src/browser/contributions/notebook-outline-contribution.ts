// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { codicon, FrontendApplicationContribution, LabelProvider, TreeNode } from '@theia/core/lib/browser';
import { NotebookEditorWidgetService } from '../service/notebook-editor-widget-service';
import { OutlineViewService } from '@theia/outline-view/lib/browser/outline-view-service';
import { NotebookModel } from '../view-model/notebook-model';
import { OutlineSymbolInformationNode } from '@theia/outline-view/lib/browser/outline-view-widget';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { DisposableCollection, isObject, URI } from '@theia/core';
import { CellKind, CellUri } from '../../common';
import { NotebookService } from '../service/notebook-service';
export interface NotebookCellOutlineNode extends OutlineSymbolInformationNode {
    uri: URI;
}

export namespace NotebookCellOutlineNode {
    export function is(element: object): element is NotebookCellOutlineNode {
        return TreeNode.is(element)
            && OutlineSymbolInformationNode.is(element)
            && isObject<NotebookCellOutlineNode>(element)
            && element.uri instanceof URI
            && element.uri.scheme === CellUri.cellUriScheme;
    }
}

@injectable()
export class NotebookOutlineContribution implements FrontendApplicationContribution {

    @inject(NotebookEditorWidgetService)
    protected readonly notebookEditorWidgetService: NotebookEditorWidgetService;

    @inject(OutlineViewService)
    protected readonly outlineViewService: OutlineViewService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(NotebookService)
    protected readonly notebookService: NotebookService;

    protected currentEditor?: NotebookEditorWidget;

    protected editorListeners: DisposableCollection = new DisposableCollection();
    protected editorModelListeners: DisposableCollection = new DisposableCollection();

    onStart(): void {
        this.notebookEditorWidgetService.onDidChangeFocusedEditor(editor => this.updateOutline(editor));

        this.outlineViewService.onDidSelect(node => this.selectCell(node));
        this.outlineViewService.onDidTapNode(node => this.selectCell(node));
    }

    protected async updateOutline(editor: NotebookEditorWidget | undefined): Promise<void> {
        if (editor && !editor.isDisposed) {
            await editor.ready;
            this.currentEditor = editor;
            this.editorListeners.dispose();
            this.editorListeners.push(editor.onDidChangeVisibility(() => {
                if (this.currentEditor === editor && !editor.isVisible) {
                    this.outlineViewService.publish([]);
                }
            }));
            if (editor.model) {
                this.editorModelListeners.dispose();
                this.editorModelListeners.push(editor.model.onDidChangeSelectedCell(() => {
                    if (editor === this.currentEditor) {
                        this.updateOutline(editor);
                    }
                }));
                const roots = editor && editor.model && await this.createRoots(editor.model);
                this.outlineViewService.publish(roots || []);
            }
        }
    }

    protected async createRoots(model: NotebookModel): Promise<OutlineSymbolInformationNode[] | undefined> {
        return model.cells.map(cell => ({
            id: cell.uri.toString(),
            iconClass: cell.cellKind === CellKind.Markup ? codicon('markdown') : codicon('code'),
            parent: undefined,
            children: [],
            selected: model.selectedCell === cell,
            expanded: false,
            uri: cell.uri,
        } as NotebookCellOutlineNode));
    }

    selectCell(node: object): void {
        if (NotebookCellOutlineNode.is(node)) {
            const parsed = CellUri.parse(node.uri);
            const model = parsed && this.notebookService.getNotebookEditorModel(parsed.notebook);
            const cell = model?.cells.find(c => c.handle === parsed?.handle);
            if (model && cell) {
                model.setSelectedCell(cell);
            }
        }
    }

}
