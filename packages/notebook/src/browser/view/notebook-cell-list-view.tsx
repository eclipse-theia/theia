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
import { CellKind } from '../../common';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellToolbarFactory } from './notebook-cell-toolbar-factory';
import { codicon } from '@theia/core/lib/browser';
import { CommandRegistry, nls } from '@theia/core';
import { NotebookCommands } from '../contributions/notebook-actions-contribution';
import { NotebookCellActionContribution } from '../contributions/notebook-cell-actions-contribution';

export interface CellRenderer {
    render(notebookData: NotebookModel, cell: NotebookCellModel, index: number): React.ReactNode
}

interface CellListProps {
    renderers: Map<CellKind, CellRenderer>;
    notebookModel: NotebookModel;
    toolbarRenderer: NotebookCellToolbarFactory;
    commandRegistry: CommandRegistry
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
                    <React.Fragment key={index}>
                        <NotebookCellDivider onAddNewCell={(kind: CellKind) => this.onAddNewCell(kind, index)} />
                        <li className={'theia-notebook-cell' + (this.state.selectedCell === cell ? ' focused' : '')} key={'cell-' + cell.handle}
                            // data-keybinding-context={cell.uri} // needed for contextKey context to work
                            onClick={() => this.setState({ selectedCell: cell })}
                            ref={(node: HTMLLIElement) => cell.refChanged(node)}>
                            <div className={'theia-notebook-cell-marker' + (this.state.selectedCell === cell ? ' theia-notebook-cell-marker-selected' : '')}></div>
                            <div className='theia-notebook-cell-content'>
                                {this.renderCellContent(cell, index)}
                            </div>
                            {this.state.selectedCell === cell &&
                                this.props.toolbarRenderer.renderToolbar(this.props.notebookModel, cell, NotebookCellActionContribution.ACTION_MENU_ID)}
                        </li>
                    </React.Fragment>
                )
            }
        </ul >;
    }

    private onAddNewCell(kind: CellKind, index: number): void {
        this.props.commandRegistry.executeCommand(NotebookCommands.ADD_NEW_CELL_COMMAND.id,
            this.props.notebookModel,
            kind,
            index
        );
    }

    renderCellContent(cell: NotebookCellModel, index: number): React.ReactNode {
        const renderer = this.props.renderers.get(cell.cellKind);
        if (!renderer) {
            throw new Error(`No renderer found for cell type ${cell.cellKind}`);
        }
        return renderer.render(this.props.notebookModel, cell, index);
    }

}

function NotebookCellDivider({ onAddNewCell }: { onAddNewCell: (type: CellKind) => void }): JSX.Element {
    const [hover, setHover] = React.useState(false);

    return <li className='theia-notebook-cell-divider' onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {hover && <div className='theia-notebook-add-cell-buttons'>
            <button className='theia-notebook-add-cell-button' onClick={() => onAddNewCell(CellKind.Markup)}>
                <div className={codicon('add') + ' theia-notebook-add-cell-button-icon'} />
                {nls.localize('theia/notebook/markdown', 'markdown')}
            </button>
            <button className='theia-notebook-add-cell-button' onClick={() => onAddNewCell(CellKind.Code)}>
                <div className={codicon('add') + ' theia-notebook-add-cell-button-icon'} />
                {nls.localize('theia/notebook/code', 'code')}
            </button>
        </div>}
    </li>;
}
