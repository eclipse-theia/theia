// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
import { DataBreakpoint } from '../breakpoint/breakpoint-marker';
import { DebugBreakpoint, DebugBreakpointDecoration, DebugBreakpointOptions } from './debug-breakpoint';

export class DebugDataBreakpoint extends DebugBreakpoint<DataBreakpoint> {
    constructor(readonly origin: DataBreakpoint, options: DebugBreakpointOptions) {
        super(BreakpointManager.DATA_URI, options);
    }

    setEnabled(enabled: boolean): void {
        if (enabled !== this.origin.enabled) {
            this.breakpoints.updateDataBreakpoint(this.origin.id, { enabled });
        }
    }

    protected override isEnabled(): boolean {
        return super.isEnabled() && this.isSupported();
    }

    protected isSupported(): boolean {
        return Boolean(this.session?.capabilities.supportsDataBreakpoints);
    }

    remove(): void {
        this.breakpoints.removeDataBreakpoint(this.origin.id);
    }

    protected doRender(): React.ReactNode {
        return <span className="line-info">{this.origin.info.description}</span>;
    }

    protected getBreakpointDecoration(message?: string[]): DebugBreakpointDecoration {
        if (!this.isSupported()) {
            return {
                className: 'codicon-debug-breakpoint-unsupported',
                message: message ?? [nls.localize('theia/debug/data-breakpoint', 'Data Breakpoint')],
            };
        }
        if (this.origin.raw.condition || this.origin.raw.hitCondition) {
            return {
                className: 'codicon-debug-breakpoint-conditional',
                message: message || [nls.localize('theia/debug/conditionalBreakpoint', 'Conditional Breakpoint')]
            };
        }
        return {
            className: 'codicon-debug-breakpoint-data',
            message: message || [nls.localize('theia/debug/data-breakpoint', 'Data Breakpoint')]
        };
    }
}
