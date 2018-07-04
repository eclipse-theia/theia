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
    VirtualWidget,
} from "@theia/core/lib/browser";
import { DebugSession } from "../debug-model";
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Emitter, Event } from "@theia/core";
import { injectable, inject } from "inversify";
import { BreakpointsManager } from "../breakpoint/breakpoint-manager";

/**
 * Is it used to display breakpoints.
 */
@injectable()
export class DebugBreakpointsWidget extends VirtualWidget {
    private readonly onDidClickBreakpointEmitter = new Emitter<DebugProtocol.Breakpoint>();
    private readonly onDidDblClickBreakpointEmitter = new Emitter<DebugProtocol.Breakpoint>();

    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(BreakpointsManager) protected readonly breakpointManager: BreakpointsManager) {
        super();

        this.id = `debug-breakpoints-${this.debugSession.sessionId}`;
        this.addClass(Styles.BREAKPOINTS_CONTAINER);
        this.node.setAttribute("tabIndex", "0");
        debugSession.on('breakpoint', event => this.onBreakpointEvent(event));
    }

    get onDidClickBreakpoint(): Event<DebugProtocol.Breakpoint> {
        return this.onDidClickBreakpointEmitter.event;
    }

    get onDidDblClickBreakpoint(): Event<DebugProtocol.Breakpoint> {
        return this.onDidDblClickBreakpointEmitter.event;
    }

    private onBreakpointEvent(event: DebugProtocol.BreakpointEvent): void {
        super.update();
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Breakpoints");
        const items: h.Child = [];

        // this.breakpointManager.getAll(this.debugSession.sessionId);

        // for (const breakpoint of this._breakpoints.values()) {
        //     const item =
        //         h.div({
        //             id: this.createId(breakpoint),
        //             className: Styles.BREAKPOINT,
        //             onclick: event => {
        //                 const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
        //                 if (selected) {
        //                     selected.className = Styles.BREAKPOINT;
        //                 }
        //                 (event.target as HTMLDivElement).className = `${Styles.BREAKPOINT} ${SELECTED_CLASS}`;

        //                 this.onDidClickBreakpointEmitter.fire(breakpoint);
        //             },
        //             ondblclick: event => this.onDidDblClickBreakpointEmitter.fire(breakpoint),
        //         }, this.toDisplayName(breakpoint));
        //     items.push(item);
        // }

        return [header, h.div(items)];
    }

    // private toDisplayName(breakpoint: DebugProtocol.Breakpoint): string {
    //     return (breakpoint.source && breakpoint.source.name ? breakpoint.source.name : '')
    //         + (breakpoint.line ? `:${breakpoint.line}` : '')
    //         + (breakpoint.column ? `:${breakpoint.column}` : '');
    // }
}

namespace Styles {
    export const BREAKPOINTS_CONTAINER = 'theia-debug-breakpoints-container';
    export const BREAKPOINT = 'theia-debug-breakpoint';
}
