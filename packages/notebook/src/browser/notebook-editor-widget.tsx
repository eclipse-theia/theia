// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { URI } from '@theia/core';
import { ReactWidget, Navigatable } from '@theia/core/lib/browser';
import { ReactNode } from '@theia/core/shared/react';
import { CellKind } from '../common';
import { Cellrenderer as CellRenderer, NotebookCellListView } from './view/notebook-cell-list-view';
import { NotebookCodeCellRenderer } from './view/notebook-code-cell-view';
import { NotebookMarkdownCellRenderer } from './view/notebook-markdown-cell-view';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { NotebookModel } from './view-model/notebook-model';

export class NotebookEditorWidget extends ReactWidget implements Navigatable {
    static readonly ID = 'notebook';

    cellList: NotebookCellListView;

    constructor(private uri: URI, public readonly notebookType: string, private notebookData: NotebookModel,
        private markdownRenderer: MarkdownRenderer,
        private editorProvider: MonacoEditorProvider) {
        super();
        this.id = 'notebook:' + uri.toString();

        this.createCellList();

        this.update();
    }

    getResourceUri(): URI | undefined {
        return this.uri;
    }
    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.uri;
    }

    createCellList(): void {
        const renderers = new Map<CellKind, CellRenderer>([
            [CellKind.Markup, new NotebookMarkdownCellRenderer(this.markdownRenderer)],
            [CellKind.Code, new NotebookCodeCellRenderer(this.editorProvider, this.uri)]
        ]);

        this.cellList = new NotebookCellListView(renderers, this.notebookData);
    }

    protected render(): ReactNode {
        return <div>
            {this.cellList.render()}
        </div>;
    }
}
