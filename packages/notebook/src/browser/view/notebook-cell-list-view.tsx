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
import { CellEditType, CellKind } from '../../common';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellToolbarFactory } from './notebook-cell-toolbar-factory';
import { codicon } from '@theia/core/lib/browser';
import { CommandRegistry, DisposableCollection, nls } from '@theia/core';
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

interface NotebookCellListState {
    selectedCell?: NotebookCellModel;
    dragOverIndicator: { cell: NotebookCellModel, position: 'top' | 'bottom' } | undefined;
}

export class NotebookCellListView extends React.Component<CellListProps, NotebookCellListState> {

    protected toDispose = new DisposableCollection();

    constructor(props: CellListProps) {
        super(props);
        this.state = { selectedCell: undefined, dragOverIndicator: undefined };
        this.toDispose.push(props.notebookModel.onDidAddOrRemoveCell(e => {
            if (e.newCellIds && e.newCellIds.length > 0) {
                this.setState({ ...this.state, selectedCell: this.props.notebookModel.cells.find(model => model.handle === e.newCellIds![e.newCellIds!.length - 1]) });
            } else {
                this.setState({ ...this.state, selectedCell: this.props.notebookModel.cells.find(cell => cell === this.state.selectedCell)});
            }
        }));
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    override render(): React.ReactNode {
        return <ul className='theia-notebook-cell-list'>
            {this.props.notebookModel.cells
                .map((cell, index) =>
                    <React.Fragment key={'cell-' + cell.handle}>
                        <NotebookCellDivider onAddNewCell={(kind: CellKind) => this.onAddNewCell(kind, index)}
                            onDrop={e => this.onDrop(e, index)}
                            onDragOver={e => this.onDragOver(e, cell, 'top')} />
                        {this.shouldRenderDragOverIndicator(cell, 'top') && <CellDropIndicator />}
                        <li className={'theia-notebook-cell' + (this.state.selectedCell === cell ? ' focused' : '')}
                            onClick={() => {
                                this.setState({ selectedCell: cell });
                                this.props.notebookModel.setSelectedCell(cell);
                            }}
                            onDragStart={e => this.onDragStart(e, index)}
                            onDragOver={e => this.onDragOver(e, cell)}
                            onDrop={e => this.onDrop(e, index)}
                            draggable={true}
                            ref={(node: HTMLLIElement) => cell.refChanged(node)}>
                            <div className={'theia-notebook-cell-marker' + (this.state.selectedCell === cell ? ' theia-notebook-cell-marker-selected' : '')}></div>
                            <div className='theia-notebook-cell-content'>
                                {this.renderCellContent(cell, index)}
                            </div>
                            {this.state.selectedCell === cell &&
                                this.props.toolbarRenderer.renderCellToolbar(NotebookCellActionContribution.ACTION_MENU, this.props.notebookModel, cell)}
                        </li>
                        {this.shouldRenderDragOverIndicator(cell, 'bottom') && <CellDropIndicator />}
                    </React.Fragment>
                )
            }
            <NotebookCellDivider onAddNewCell={(kind: CellKind) => this.onAddNewCell(kind, this.props.notebookModel.cells.length)}
                onDrop={e => this.onDrop(e, this.props.notebookModel.cells.length - 1)}
                onDragOver={e => this.onDragOver(e, this.props.notebookModel.cells[this.props.notebookModel.cells.length - 1], 'bottom')} />
        </ul>;
    }

    renderCellContent(cell: NotebookCellModel, index: number): React.ReactNode {
        const renderer = this.props.renderers.get(cell.cellKind);
        if (!renderer) {
            throw new Error(`No renderer found for cell type ${cell.cellKind}`);
        }
        return renderer.render(this.props.notebookModel, cell, index);
    }

    protected onDragStart(event: React.DragEvent<HTMLLIElement>, index: number): void {
        event.stopPropagation();
        event.dataTransfer.setData('text/theia-notebook-cell-index', index.toString());
        event.dataTransfer.setData('text/plain', this.props.notebookModel.cells[index].source);
    }

    protected onDragOver(event: React.DragEvent<HTMLLIElement>, cell: NotebookCellModel, position?: 'top' | 'bottom'): void {
        event.preventDefault();
        event.stopPropagation();
        // show indicator
        this.setState({ ...this.state, dragOverIndicator: { cell, position: position ?? event.nativeEvent.offsetY < event.currentTarget.clientHeight / 2 ? 'top' : 'bottom' } });
    }

    protected onDrop(event: React.DragEvent<HTMLLIElement>, dropElementIndex: number): void {
        const index = parseInt(event.dataTransfer.getData('text/theia-notebook-cell-index'));
        const isTargetBelow = index < dropElementIndex;
        let newIdx = this.state.dragOverIndicator?.position === 'top' ? dropElementIndex : dropElementIndex + 1;
        newIdx = isTargetBelow ? newIdx - 1 : newIdx;
        if (index !== undefined && index !== dropElementIndex) {
            this.props.notebookModel.applyEdits([{
                editType: CellEditType.Move,
                length: 1,
                index,
                newIdx
            }], true);
        }
        this.setState({ ...this.state, dragOverIndicator: undefined });
    }

    protected onAddNewCell(kind: CellKind, index: number): void {
        this.props.commandRegistry.executeCommand(NotebookCommands.ADD_NEW_CELL_COMMAND.id,
            this.props.notebookModel,
            kind,
            index
        );
    }

    protected shouldRenderDragOverIndicator(cell: NotebookCellModel, position: 'top' | 'bottom'): boolean {
        return this.state.dragOverIndicator !== undefined &&
            this.state.dragOverIndicator.cell === cell &&
            this.state.dragOverIndicator.position === position;
    }

}

export interface NotebookCellDividerProps {
    onAddNewCell: (type: CellKind) => void;
    onDrop: (event: React.DragEvent<HTMLLIElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLLIElement>) => void;
}

export function NotebookCellDivider({ onAddNewCell, onDrop, onDragOver }: NotebookCellDividerProps): React.JSX.Element {
    const [hover, setHover] = React.useState(false);

    return <li className='theia-notebook-cell-divider' onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onDrop={onDrop} onDragOver={onDragOver}>
        {hover && <div className='theia-notebook-add-cell-buttons'>
            <button className='theia-notebook-add-cell-button' onClick={() => onAddNewCell(CellKind.Code)} title={nls.localizeByDefault('Add Code Cell')}>
                <div className={codicon('add') + ' theia-notebook-add-cell-button-icon'} />
                {nls.localizeByDefault('Code')}
            </button>
            <button className='theia-notebook-add-cell-button' onClick={() => onAddNewCell(CellKind.Markup)} title={nls.localizeByDefault('Add Markdown Cell')}>
                <div className={codicon('add') + ' theia-notebook-add-cell-button-icon'} />
                {nls.localizeByDefault('Markdown')}
            </button>
        </div>}
    </li>;
}

function CellDropIndicator(): React.JSX.Element {
    return <div className='theia-notebook-cell-drop-indicator' />;
}
