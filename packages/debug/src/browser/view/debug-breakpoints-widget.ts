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

import {
    VirtualWidget, SELECTED_CLASS,
} from "@theia/core/lib/browser";
import { DebugSession } from "../debug-model";
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Emitter, Event } from "@theia/core";
import { injectable, inject } from "inversify";
import { BreakpointsManager } from "../breakpoint/breakpoint-manager";
import { ExtDebugProtocol } from "../../common/debug-common";
import { DebugUtils } from "../debug-utils";

/**
 * Is it used to display breakpoints.
 */
@injectable()
export class DebugBreakpointsWidget extends VirtualWidget {
    private readonly onDidClickBreakpointEmitter = new Emitter<ExtDebugProtocol.AggregatedBreakpoint>();
    private readonly onDidDblClickBreakpointEmitter = new Emitter<ExtDebugProtocol.AggregatedBreakpoint>();
    private breakpoints: ExtDebugProtocol.AggregatedBreakpoint[] = [];

    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(BreakpointsManager) protected readonly breakpointManager: BreakpointsManager) {
        super();

        this.id = `debug-breakpoints-${debugSession.sessionId}`;
        this.addClass(Styles.BREAKPOINTS_CONTAINER);
        this.node.setAttribute("tabIndex", "0");
        this.breakpointManager.onDidChangeBreakpoints(() => this.onBreakpointsChanged());
    }

    get onDidClickBreakpoint(): Event<ExtDebugProtocol.AggregatedBreakpoint> {
        return this.onDidClickBreakpointEmitter.event;
    }

    get onDidDblClickBreakpoint(): Event<ExtDebugProtocol.AggregatedBreakpoint> {
        return this.onDidDblClickBreakpointEmitter.event;
    }

    private onBreakpointsChanged(): void {
        this.breakpointManager.get(this.debugSession.sessionId).then(breakpoints => {
            this.breakpoints = breakpoints;
            super.update();
        });
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Breakpoints");
        const items: h.Child = [];

        for (const breakpoint of this.breakpoints) {
            const item =
                h.div({
                    id: DebugUtils.makeBreakpointId(breakpoint),
                    className: Styles.BREAKPOINT,
                    onclick: event => {
                        const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
                        if (selected) {
                            selected.className = Styles.BREAKPOINT;
                        }
                        (event.target as HTMLDivElement).className = `${Styles.BREAKPOINT} ${SELECTED_CLASS}`;

                        this.onDidClickBreakpointEmitter.fire(breakpoint);
                    },
                    ondblclick: () => this.onDidDblClickBreakpointEmitter.fire(breakpoint),
                }, this.toDisplayName(breakpoint));
            items.push(item);
        }

        return [header, h.div(items)];
    }

    private toDisplayName(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): string {
        if ('origin' in breakpoint) {
            if (DebugUtils.isSourceBreakpoint(breakpoint)) {
                return this.toDisplayNameSourceBrk(breakpoint.source!, breakpoint.origin as DebugProtocol.SourceBreakpoint);

            } else if (DebugUtils.isFunctionBreakpoint(breakpoint)) {
                return (breakpoint.origin as DebugProtocol.FunctionBreakpoint).name;

            } else if (DebugUtils.isExceptionBreakpoint(breakpoint)) {
                return (breakpoint.origin as ExtDebugProtocol.ExceptionBreakpoint).filter;
            }
        }

        throw new Error('Unrecognized breakpoint type: ' + JSON.stringify(breakpoint));
    }

    private toDisplayNameSourceBrk(source: DebugProtocol.Source, breakpoint: DebugProtocol.SourceBreakpoint): string {
        return source.name! + `:${breakpoint.line}` + (breakpoint.column ? `:${breakpoint.column}` : '');
    }
}

namespace Styles {
    export const BREAKPOINTS_CONTAINER = 'theia-debug-breakpoints-container';
    export const BREAKPOINT = 'theia-debug-breakpoint';
}
