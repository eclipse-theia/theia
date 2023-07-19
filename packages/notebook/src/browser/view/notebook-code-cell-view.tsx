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

import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { MonacoEditorServices } from '@theia/monaco/lib/browser/monaco-editor';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { CellEditor } from './notebook-cell-editor';
import { Cellrenderer } from './notebook-cell-list-view';

@injectable()
export class NotebookCodeCellRenderer implements Cellrenderer {
    @inject(MonacoEditorServices)
    protected readonly monacoServices: MonacoEditorServices;

    render(notebookModel: NotebookModel, cell: NotebookCellModel, handle: number): React.ReactNode {
        return <div>
            <CellEditor notebookModel={notebookModel} cell={cell} monacoServices={this.monacoServices}/>
            <NotebookCodeCellOutputs cell={cell}/>
        </div >;
    }
}

interface NotebookCellOutputProps {
    cell: NotebookCellModel;
}

function NotebookCodeCellOutputs({cell}: NotebookCellOutputProps): JSX.Element {
    const outputJson = cell.outputs.length > 0 ? JSON.stringify(cell.outputs.map(output => output.toDto())) : undefined;
    const [outputs, setOutputs] = React.useState(outputJson);
    React.useEffect(() => {
        cell.onDidChangeOutputs(() => setOutputs(cell.outputs.length > 0 ? JSON.stringify(cell.outputs.map(output => output.toDto())) : undefined));
    }, []);
    return <>{outputs && <span>{outputs}</span>}</>;

}
