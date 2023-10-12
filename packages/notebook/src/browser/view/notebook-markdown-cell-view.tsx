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
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { NotebookModel } from '../view-model/notebook-model';
import { CellRenderer } from './notebook-cell-list-view';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { CellEditor } from './notebook-cell-editor';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoEditorServices } from '@theia/monaco/lib/browser/monaco-editor';
import { nls } from '@theia/core';

@injectable()
export class NotebookMarkdownCellRenderer implements CellRenderer {

    @inject(MarkdownRenderer)
    private readonly markdownRenderer: MarkdownRenderer;
    @inject(MonacoEditorServices)
    protected readonly monacoServices: MonacoEditorServices;

    render(notebookModel: NotebookModel, cell: NotebookCellModel): React.ReactNode {
        return <MarkdownCell markdownRenderer={this.markdownRenderer} monacoServices={this.monacoServices}
            cell={cell} notebookModel={notebookModel} />;
    }

}

interface MarkdownCellProps {
    markdownRenderer: MarkdownRenderer,
    monacoServices: MonacoEditorServices

    cell: NotebookCellModel,
    notebookModel: NotebookModel
}

function MarkdownCell({ markdownRenderer, monacoServices, cell, notebookModel }: MarkdownCellProps): React.JSX.Element {
    const [editMode, setEditMode] = React.useState(false);

    React.useEffect(() => {
        const listener = cell.onDidRequestCellEditChange(cellEdit => setEditMode(cellEdit));
        return () => listener.dispose();
    }, [editMode]);

    let markdownContent = React.useMemo(() => markdownRenderer.render(new MarkdownStringImpl(cell.source)).element.innerHTML, [cell, editMode]);
    if (markdownContent.length === 0) {
        markdownContent = `<i class="theia-notebook-empty-markdown">${nls.localizeByDefault('Empty markdown cell, double-click or press enter to edit.')}</i>`;
    }

    return editMode ?
        <CellEditor cell={cell} notebookModel={notebookModel} monacoServices={monacoServices} /> :
        <div className='theia-notebook-markdown-content'
            onDoubleClick={() => cell.requestEdit()}
            // This sets the non React HTML node from the markdown renderers output as a child node to this react component
            // This is currently sadly the best way we have to combine React (Virtual Nodes) and normal dom nodes
            // the HTML is already sanitized by the markdown renderer, so we don't need to sanitize it again
            dangerouslySetInnerHTML={{ __html: markdownContent }} // eslint-disable-line react/no-danger
        />;
}
