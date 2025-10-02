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

export class DebugFunctionBreakpoint extends DebugBreakpoint<FunctionBreakpoint> implements TreeElement {

    static create(origin: FunctionBreakpoint, options: DebugBreakpointOptions): DebugFunctionBreakpoint {
        return new this(origin, options);
    }

    private constructor(readonly origin: FunctionBreakpoint, options: DebugBreakpointOptions) {
        super(BreakpointManager.FUNCTION_URI, options);
    }

    setEnabled(enabled: boolean): void {
        this.breakpoints.enableBreakpoint(this, enabled);
    }

    protected override isEnabled(): boolean {
        return super.isEnabled() && this.isSupported();
    }

    protected isSupported(): boolean {
        return this.raw ? !!this.raw.supportsFunctionBreakpoints : true;
    }

    remove(): void {
        this.breakpoints.removeFunctionBreakpoint(this);
    }

    get name(): string {
        return this.origin.raw.name;
    }

    protected doRender(): React.ReactNode {
        return <span className='line-info'>{this.name}</span>;
    }

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

    static async editOrCreate(breakpoints: BreakpointManager, existing?: DebugFunctionBreakpoint): Promise<void> {
        const input = new SingleTextInputDialog({
            title: nls.localizeByDefault('Add Function Breakpoint'),
            initialValue: this.name
        });
        const newValue = await input.open();
        if (!newValue) { return; }
        if (existing) {
            breakpoints.updateFunctionBreakpoint(existing, { name: newValue });
        } else {
            breakpoints.addFunctionBreakpoint(FunctionBreakpoint.create({ name: newValue }));
        }
    }

    async open(): Promise<void> {
        DebugFunctionBreakpoint.editOrCreate(this.breakpoints, this);
    }
}
