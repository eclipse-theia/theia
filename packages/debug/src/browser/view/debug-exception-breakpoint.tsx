// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { ExceptionBreakpoint } from '../breakpoint/breakpoint-marker';
import { SingleTextInputDialog, TREE_NODE_INFO_CLASS, codicon, TreeWidget } from '@theia/core/lib/browser';
import { SelectableTreeNode } from '@theia/core/lib/browser/tree/tree-selection';
import { nls, CommandService } from '@theia/core';
import { DebugCommands } from '../debug-commands';

export class DebugExceptionBreakpoint implements TreeElement {

    readonly id: string;
    protected treeWidget?: TreeWidget;

    constructor(
        readonly data: ExceptionBreakpoint,
        readonly breakpoints: BreakpointManager,
        protected readonly commandService: CommandService
    ) {
        this.id = data.raw.filter + ':' + data.raw.label;
    }

    render(host: TreeWidget): React.ReactNode {
        this.treeWidget = host;
        return <div title={this.data.raw.description || this.data.raw.label} className='theia-source-breakpoint'>
            <span className='theia-debug-breakpoint-icon' />
            <input type='checkbox' checked={this.data.enabled} onChange={this.toggle} />
            <span className='line-info'>
                <span className='name'>{this.data.raw.label} </span>
                {this.data.condition &&
                    <span title={nls.localizeByDefault('Expression condition: {0}', this.data.condition)}
                        className={'path ' + TREE_NODE_INFO_CLASS}>{this.data.condition} </span>}
            </span>
            {this.renderActions()}
        </div>;
    }

    protected renderActions(): React.ReactNode {
        if (this.data.raw.supportsCondition) {
            return <div className='theia-debug-breakpoint-actions'>
                <div className={codicon('edit', true)} title={nls.localizeByDefault('Edit Condition...')} onClick={this.onEdit} />
            </div>;
        }
        return undefined;
    }

    protected onEdit = async () => {
        await this.selectInTree();
        this.commandService.executeCommand(DebugCommands.EDIT_BREAKPOINT_CONDITION.id);
    };

    protected async selectInTree(): Promise<void> {
        if (this.treeWidget?.model && SelectableTreeNode.is(this)) {
            this.treeWidget.model.selectNode(this);
        }
    }

    protected toggle = () => this.breakpoints.toggleExceptionBreakpoint(this.data.raw.filter);

    async editCondition(): Promise<void> {
        const inputDialog = new SingleTextInputDialog({
            title: this.data.raw.label,
            placeholder: this.data.raw.conditionDescription,
            initialValue: this.data.condition
        });
        let condition = await inputDialog.open();
        if (condition === undefined) {
            return;
        }
        if (condition === '') {
            condition = undefined;
        }
        if (condition !== this.data.condition) {
            this.breakpoints.updateExceptionBreakpoint(this.data.raw.filter, { condition });
        }
    }
}
