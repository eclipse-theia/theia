// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { InstructionBreakpoint } from '../breakpoint/breakpoint-marker';
import { DebugBreakpoint, DebugBreakpointDecoration, DebugBreakpointOptions } from './debug-breakpoint';

export class DebugInstructionBreakpoint extends DebugBreakpoint<InstructionBreakpoint> {
    constructor(readonly origin: InstructionBreakpoint, options: DebugBreakpointOptions) {
        super(BreakpointManager.INSTRUCTION_URI, options);
    }

    setEnabled(enabled: boolean): void {
        if (enabled !== this.origin.enabled) {
            this.breakpoints.updateInstructionBreakpoint(this.origin.id, { enabled });
        }
    }

    protected override isEnabled(): boolean {
        return super.isEnabled() && this.isSupported();
    }

    protected isSupported(): boolean {
        return Boolean(this.session?.capabilities.supportsInstructionBreakpoints);
    }

    remove(): void {
        this.breakpoints.removeInstructionBreakpoint(this.origin.instructionReference);
    }

    protected doRender(): React.ReactNode {
        return <span className="line-info">{this.origin.instructionReference}</span>;
    }

    protected getBreakpointDecoration(message?: string[]): DebugBreakpointDecoration {
        if (!this.isSupported()) {
            return {
                className: 'codicon-debug-breakpoint-unsupported',
                message: message ?? [nls.localize('theia/debug/instruction-breakpoint', 'Instruction Breakpoint')],
            };
        }
        if (this.origin.condition || this.origin.hitCondition) {
            return {
                className: 'codicon-debug-breakpoint-conditional',
                message: message || [nls.localize('theia/debug/conditionalBreakpoint', 'Conditional Breakpoint')]
            };
        }
        return {
            className: 'codicon-debug-breakpoint',
            message: message || [nls.localize('theia/debug/instruction-breakpoint', 'Instruction Breakpoint')]
        };
    }
}
