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
import { ACTION_ITEM } from '@theia/core/lib/browser';
import { NotebookCellToolbarItem } from './notebook-cell-toolbar-factory';

export interface NotebookCellToolbarProps {
    inlineItems: NotebookCellToolbarItem[];
}

abstract class NotebookCellActionItems extends React.Component<NotebookCellToolbarProps> {

    protected renderItem(item: NotebookCellToolbarItem): React.ReactNode {
        return <div key={item.id} title={item.label} onClick={item.onClick} className={`${item.icon} ${ACTION_ITEM} theia-notebook-cell-toolbar-item`} />;
    }

}

export class NotebookCellToolbar extends NotebookCellActionItems {

    override render(): React.ReactNode {
        return <div className='theia-notebook-cell-toolbar'>
            {this.props.inlineItems.map(item => this.renderItem(item))}
        </div>;
    }

}

export class NotebookCellSidebar extends NotebookCellActionItems {

    override render(): React.ReactNode {
        return <div className='theia-notebook-cell-sidebar'>
            {this.props.inlineItems.map(item => this.renderItem(item))}
        </div>;
    }
}

