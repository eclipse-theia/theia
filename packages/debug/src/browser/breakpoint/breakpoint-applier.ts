/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import { DebugProtocol } from 'vscode-debugprotocol';
import { BreakpointStorage } from './breakpoint-marker';
import { DebugUtils } from '../debug-utils';
import { DebugSession } from '../debug-model';

/**
 * Applies session breakpoints.
 */
@injectable()
export class BreakpointsApplier {
    constructor(@inject(BreakpointStorage) protected readonly storage: BreakpointStorage) { }

    applySessionBreakpoints(debugSession: DebugSession, source?: DebugProtocol.Source): Promise<void> {
        return this.storage.get(DebugUtils.isSourceBreakpoint)
            .then(breakpoints => breakpoints.filter(b => b.sessionId === debugSession.sessionId))
            .then(breakpoints => breakpoints.filter(b => source ? DebugUtils.checkUri(b, DebugUtils.toUri(source)) : true))
            .then(breakpoints => {
                const promises: Promise<void>[] = [];

                for (const breakpointsBySource of DebugUtils.groupBySource(breakpoints).values()) {
                    const args: DebugProtocol.SetBreakpointsArguments = {
                        source: breakpointsBySource[0].source!,
                        breakpoints: breakpointsBySource.map(b => b.origin as DebugProtocol.SourceBreakpoint)
                    };

                    // The array elements are in the same order as the elements
                    // of the 'breakpoints' in the SetBreakpointsArguments.
                    promises.push(debugSession.setBreakpoints(args)
                        .then(response => {
                            for (const i in breakpointsBySource) {
                                if (breakpointsBySource) {
                                    if (response.body.breakpoints) {
                                        breakpointsBySource[i].created = response.body.breakpoints[i];
                                    }
                                }
                            }
                            return breakpointsBySource;
                        }).then(result => this.storage.set(result)));
                }

                return Promise.all(promises);
            })
            .then(() => { });
    }
}
