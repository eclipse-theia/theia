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
import { FunctionBreakpoint } from '../breakpoint/breakpoint-marker';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugBreakpoint, DebugBreakpointOptions, DebugBreakpointDecoration } from './debug-breakpoint';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';

export class DebugFunctionBreakpoint extends DebugBreakpoint<FunctionBreakpoint> implements TreeElement {

    constructor(readonly origin: FunctionBreakpoint, options: DebugBreakpointOptions) {
        super(BreakpointManager.FUNCTION_URI, options);
    }

    setEnabled(enabled: boolean): void {
        const breakpoints = this.breakpoints.getFunctionBreakpoints();
        const breakpoint = breakpoints.find(b => b.id === this.id);
        if (breakpoint && breakpoint.enabled !== enabled) {
            breakpoint.enabled = enabled;
            this.breakpoints.setFunctionBreakpoints(breakpoints);
        }
    }

    protected override isEnabled(): boolean {
        return super.isEnabled() && this.isSupported();
    }

    protected isSupported(): boolean {
        const { session } = this;
        return !session || !!session.capabilities.supportsFunctionBreakpoints;
    }

    remove(): void {
        const breakpoints = this.breakpoints.getFunctionBreakpoints();
        const newBreakpoints = breakpoints.filter(b => b.id !== this.id);
        if (breakpoints.length !== newBreakpoints.length) {
            this.breakpoints.setFunctionBreakpoints(newBreakpoints);
        }
    }

    get name(): string {
        return this.origin.raw.name;
    }

    protected doRender(): React.ReactNode {
        return <React.Fragment>
            <span className='line-info'>{this.name}</span>
            {this.renderActions()}
        </React.Fragment>;
    }

    protected renderActions(): React.ReactNode {
        return <div className='theia-debug-breakpoint-actions'>
            <div className={codicon('edit', true)} title={nls.localizeByDefault('Edit Condition...')} onClick={this.onEdit} />
            <div className={codicon('close', true)} title={nls.localizeByDefault('Remove Breakpoint')} onClick={this.onRemove} />
        </div>;
    }

    protected onEdit = async () => {
        await this.selectInTree();
        this.open();
    };

    protected onRemove = async () => {
        await this.selectInTree();
        this.remove();
    };

    protected override doGetDecoration(): DebugBreakpointDecoration {
        if (!this.isSupported()) {
            return this.getDisabledBreakpointDecoration(nls.localizeByDefault('Function breakpoints are not supported by this debug type'));
        }
        return super.doGetDecoration();
    }

    protected getBreakpointDecoration(message?: string[]): DebugBreakpointDecoration {
        return {
            className: 'codicon-debug-breakpoint-function',
            message: message || [nls.localizeByDefault('Function Breakpoint')]
        };
    }

    async open(): Promise<void> {
        const input = new SingleTextInputDialog({
            title: nls.localizeByDefault('Add Function Breakpoint'),
            initialValue: this.name
        });
        const newValue = await input.open();
        if (newValue !== undefined && newValue !== this.name) {
            const breakpoints = this.breakpoints.getFunctionBreakpoints();
            const breakpoint = breakpoints.find(b => b.id === this.id);
            if (breakpoint) {
                if (breakpoint.raw.name !== newValue) {
                    breakpoint.raw.name = newValue;
                    this.breakpoints.setFunctionBreakpoints(breakpoints);
                }
            } else {
                this.origin.raw.name = newValue;
                breakpoints.push(this.origin);
                this.breakpoints.setFunctionBreakpoints(breakpoints);
            }
        }
    }

}
