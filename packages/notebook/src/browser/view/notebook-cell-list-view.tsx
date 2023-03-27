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
import * as React from '@theia/core/shared/react';
import { CellDto, CellKind } from '../../common';
import { NotebookModel } from '../view-model/notebook-model';

export interface Cellrenderer {
    render(notebookData: NotebookModel, cell: CellDto, index: number): React.ReactNode
}

export class NotebookCellListView {

    constructor(private renderers: Map<CellKind, Cellrenderer>, private notebookData: NotebookModel) {
    }

    render(): React.ReactNode {
        return <ul className='theia-notebook-cell-list'>
            {this.notebookData.cells.map((cell, index) => this.renderers.get(cell.cellKind)?.render(this.notebookData, cell, index))}
        </ul >;
    }

}
