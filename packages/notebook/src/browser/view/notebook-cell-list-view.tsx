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
import { CellKind } from '../../common';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellToolbarFactory } from './notebook-cell-toolbar-factory';

export interface Cellrenderer {
    render(notebookData: NotebookModel, cell: NotebookCellModel, index: number): React.ReactNode
}

interface CellListProps {
    renderers: Map<CellKind, Cellrenderer>;
    notebookModel: NotebookModel;
    toolbarRenderer: NotebookCellToolbarFactory;
}

export class NotebookCellListView extends React.Component<CellListProps, { selectedCell?: NotebookCellModel }> {

    constructor(props: CellListProps) {
        super(props);
        this.state = { selectedCell: undefined };
        props.notebookModel.onDidAddOrRemoveCell(e => {
            this.setState({ selectedCell: undefined });
        });
    }

    override render(): React.ReactNode {
        return <ul className='theia-notebook-cell-list'>
            {this.props.notebookModel.cells
                .map((cell, index) =>
                    <li className='theia-notebook-cell' key={'cell-' + index} onClick={() => this.setState({ selectedCell: cell })}>
                        <div className={'theia-notebook-cell-marker' + (this.state.selectedCell === cell ? ' theia-notebook-cell-marker-selected' : '')}></div>
                        <div className='theia-notebook-cell-statusbar'></div>
                        <div className='theia-notebook-cell-content'>
                            {this.renderCellContent(cell, index)}
                        </div>
                        {this.state.selectedCell === cell && this.props.toolbarRenderer.renderToolbar(this.props.notebookModel, cell)}
                    </li>
                )
            }
        </ul >;
    }

    renderCellContent(cell: NotebookCellModel, index: number): React.ReactNode {
        return this.props.renderers.get(cell.cellKind)?.render(this.props.notebookModel, cell, index);
    }

}
