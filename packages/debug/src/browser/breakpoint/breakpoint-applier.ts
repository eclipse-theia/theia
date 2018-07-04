/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from 'inversify';
import { DebugProtocol } from 'vscode-debugprotocol';
import { BreakpointStorage } from './breakpoint-storage';
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
            // .then(breakpoints => breakpoints.filter(b => this.checkUri(b, editor.uri)) : breakpoints)
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
                        }).then(result => this.storage.updateAll(result)));
                }

                return Promise.all(promises);
            })
            .then(() => { });
    }
}
