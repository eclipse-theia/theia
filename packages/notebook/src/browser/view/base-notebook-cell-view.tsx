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
import { ReactNode } from '@theia/core/shared/react';
import { CellDto } from '../../common';
import { NotebookModel } from '../view-model/notebook-model';
import { Cellrenderer } from './notebook-cell-list-view';

export abstract class BaseNotebookCellView implements Cellrenderer {

    protected abstract renderCell(notebookModel: NotebookModel, cell: CellDto, handle: number): ReactNode;

    render(notebookModel: NotebookModel, cell: CellDto, handle: number): ReactNode {
        return <li className='theia-notebook-cell' key={'cell-' + handle}>
            <div className='theia-notebook-cell-marker'></div>
            <div className='theia-notebook-cell-toolbar'></div>
            <div className='theia-notebook-cell-content'>
                {this.renderCell(notebookModel, cell, handle)}
            </div>
        </li>;
    }

}
