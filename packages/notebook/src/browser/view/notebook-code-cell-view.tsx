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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { Editor } from './notebook-cell-editor';
import { Cellrenderer } from './notebook-cell-list-view';

@injectable()
export class NotebookCodeCellRenderer implements Cellrenderer {

    @inject(MonacoEditorProvider)
    private editorProvider: MonacoEditorProvider;

    render(notebookModel: NotebookModel, cell: NotebookCellModel, handle: number): React.ReactNode {
        return <div>
            <Editor notebookModel={notebookModel} editorProvider={this.editorProvider} cell={cell} />
            {/* {cell.outputs && cell.outputs.flatMap(output => output.outputs.map(item => <div>{new TextDecoder().decode(item.data.buffer)}</div>))} */}
        </div >;
    }
}
