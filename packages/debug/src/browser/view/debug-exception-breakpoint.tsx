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
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { TREE_NODE_INFO_CLASS, codicon, TreeWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import { DebugBreakpoint, DebugBreakpointDecoration, DebugBreakpointOptions } from '../model/debug-breakpoint';
import { DebugCommands } from '../debug-commands';

export class DebugExceptionBreakpoint extends DebugBreakpoint<ExceptionBreakpoint> implements TreeElement {

    protected readonly sessionEnablement = new Set<string>();
    /** Determines which exception breakpoints to show when no session is active. */
    protected persistentlyVisible = false;

    static create(origin: ExceptionBreakpoint,
        options: DebugBreakpointOptions): DebugExceptionBreakpoint {
        return new this(origin, options);
    }

    constructor(
        readonly origin: ExceptionBreakpoint,
        readonly options: DebugBreakpointOptions
    ) {
        super(BreakpointManager.EXCEPTION_URI, options);
    }

    override render(host: TreeWidget): React.ReactNode {
        this.treeWidget = host;
        return <div title={this.origin.raw.description || this.origin.raw.label} className='theia-source-breakpoint'>
            <span className='theia-debug-breakpoint-icon' />
            <input type='checkbox' checked={this.origin.enabled} onChange={this.toggle} />
            <span className='line-info'>
                <span className='name'>{this.origin.raw.label} </span>
                {this.origin.condition &&
                    <span title={nls.localizeByDefault('Expression condition: {0}', this.origin.condition)}
                        className={'path ' + TREE_NODE_INFO_CLASS}>{this.origin.condition} </span>}
            </span>
            {this.renderActions()}
        </div>;
    }

    protected renderActions(): React.ReactNode {
        if (this.origin.raw.supportsCondition) {
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

    setSessionEnablement(sessionId: string, enabled: boolean): void {
        if (enabled) {
            this.sessionEnablement.add(sessionId);
        } else {
            this.sessionEnablement.delete(sessionId);
        }
    }

    isEnabledForSession(sessionId: string): boolean {
        return this.sessionEnablement.has(sessionId);
    }

    setPersistentVisibility(visible: boolean): void {
        this.persistentlyVisible = visible;
    }

    isPersistentlyVisible(): boolean {
        return this.persistentlyVisible;
    }

    protected override doRender(): React.ReactNode {
        return undefined;
    }

    protected toggle = (e: React.ChangeEvent<HTMLInputElement>) => this.setEnabled(e.currentTarget.checked);

    override setEnabled(enabled: boolean): void {
        this.breakpoints.enableBreakpoint(this, enabled);
    }

    override remove(): void {
        this.breakpoints.enableBreakpoint(this, false);
    }

    async editCondition(): Promise<void> {
        const inputDialog = new SingleTextInputDialog({
            title: this.origin.raw.label,
            placeholder: this.origin.raw.conditionDescription,
            initialValue: this.origin.condition
        });
        let condition = await inputDialog.open();
        if (condition === undefined) {
            return;
        }
        if (condition === '') {
            condition = undefined;
        }
        if (condition !== this.origin.condition) {
            this.breakpoints.updateBreakpoint(this, { condition });
        }
    }

    protected override getBreakpointDecoration(message?: string[] | undefined): DebugBreakpointDecoration {
        return {
            className: 'never-decorated',
            message: message ?? []
        };
    }
}
