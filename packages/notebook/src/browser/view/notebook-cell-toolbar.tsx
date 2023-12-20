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
import { DisposableCollection, Event } from '@theia/core';
import { ContextKeyChangeEvent } from '@theia/core/lib/browser/context-key-service';

export interface NotebookCellToolbarProps {
    getMenuItems: () => NotebookCellToolbarItem[];
    onContextKeysChanged: Event<ContextKeyChangeEvent>;
}

interface NotebookCellToolbarState {
    inlineItems: NotebookCellToolbarItem[];
}

abstract class NotebookCellActionBar extends React.Component<NotebookCellToolbarProps, NotebookCellToolbarState> {

    protected toDispose = new DisposableCollection();

    constructor(props: NotebookCellToolbarProps) {
        super(props);
        this.toDispose.push(props.onContextKeysChanged(e => {
            if (this.props.getMenuItems().some(item => item.contextKeys ? e.affects(item.contextKeys) : false)) {
                this.setState({ inlineItems: this.props.getMenuItems() });
            }
        }));
        this.state = { inlineItems: this.props.getMenuItems() };
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    protected renderItem(item: NotebookCellToolbarItem): React.ReactNode {
        return <div key={item.id} title={item.label} onClick={item.onClick} className={`${item.icon} ${ACTION_ITEM} theia-notebook-cell-toolbar-item`} />;
    }

}

export class NotebookCellToolbar extends NotebookCellActionBar {

    override render(): React.ReactNode {
        return <div className='theia-notebook-cell-toolbar'>
            {this.state.inlineItems.map(item => this.renderItem(item))}
        </div>;
    }

}

export class NotebookCellSidebar extends NotebookCellActionBar {

    override render(): React.ReactNode {
        return <div className='theia-notebook-cell-sidebar'>
            {this.state.inlineItems.map(item => this.renderItem(item))}
        </div>;
    }
}

