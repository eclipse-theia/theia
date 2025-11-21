// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { TreeSource, TreeElement } from '@theia/core/lib/browser/source-tree';
import { DebugViewModel } from './debug-view-model';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugExceptionBreakpoint } from './debug-exception-breakpoint';
import { DebugSession, DebugState } from '../debug-session';
import { DebugBreakpoint } from '../model/debug-breakpoint';

@injectable()
export class DebugBreakpointsSource extends TreeSource {

    @inject(DebugViewModel)
    protected readonly model: DebugViewModel;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    @postConstruct()
    protected init(): void {
        this.fireDidChange();
        this.toDispose.push(this.model.onDidChangeBreakpoints(() => this.fireDidChange()));
    }

    /**
     * Aggregates verification status from all running sessions.
     * Updates breakpoints with raw data if any session has verified them.
     * Matches breakpoints by their unique ID.
     */
    protected aggregateVerificationStatus<T extends DebugBreakpoint>(
        breakpoints: T[],
        getSessionBreakpoints: (session: DebugSession) => T[]
    ): void {
        for (const session of this.model.sessions) {
            if (session.state > DebugState.Initializing) {
                const sessionBreakpoints = getSessionBreakpoints(session);
                for (const breakpoint of breakpoints) {
                    const match = sessionBreakpoints.find(sb => sb.id === breakpoint.id);
                    if (match && match.raw && match.raw.verified) {
                        breakpoint.update({ raw: match.raw });
                        break; // Found a verified instance, no need to check other sessions
                    }
                }
            }
        }
    }

    *getElements(): IterableIterator<TreeElement> {
        for (const exceptionBreakpoint of this.breakpoints.getExceptionBreakpoints()) {
            yield new DebugExceptionBreakpoint(exceptionBreakpoint, this.breakpoints);
        }

        // Function breakpoints
        const functionBreakpoints = this.model.functionBreakpoints;
        this.aggregateVerificationStatus(
            functionBreakpoints,
            session => session.getFunctionBreakpoints()
        );
        for (const functionBreakpoint of functionBreakpoints) {
            yield functionBreakpoint;
        }

        // Instruction breakpoints
        const instructionBreakpoints = this.model.instructionBreakpoints;
        this.aggregateVerificationStatus(
            instructionBreakpoints,
            session => session.getInstructionBreakpoints()
        );
        for (const instructionBreakpoint of instructionBreakpoints) {
            yield instructionBreakpoint;
        }

        // Source breakpoints
        const sourceBreakpoints = this.model.breakpoints;
        this.aggregateVerificationStatus(
            sourceBreakpoints,
            session => session.getSourceBreakpoints()
        );
        for (const breakpoint of sourceBreakpoints) {
            yield breakpoint;
        }
    }

}
