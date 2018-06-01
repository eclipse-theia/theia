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

import {
    VirtualWidget,
    SELECTED_CLASS,
} from "@theia/core/lib/browser";
import { DebugSession } from "../debug-session";
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Emitter, Event } from "@theia/core";
import { injectable, inject } from "inversify";

/**
 * Is it used to display breakpoints.
 */
@injectable()
export class DebugBreakpointsWidget extends VirtualWidget {
    private _breakpoints = new Map<string, DebugProtocol.Breakpoint>();

    private readonly onDidClickBreakpointEmitter = new Emitter<DebugProtocol.Breakpoint>();
    private readonly onDidDblClickBreakpointEmitter = new Emitter<DebugProtocol.Breakpoint>();

    constructor(@inject(DebugSession) protected readonly debugSession: DebugSession) {
        super();
        this.id = this.createId();
        this.addClass(Styles.BREAKPOINTS_CONTAINER);
        this.node.setAttribute("tabIndex", "0");
        debugSession.on('breakpoint', event => this.onBreakpointEvent(event));

        // TODO remove
        const breakpoint1 = { id: 1, verified: true, line: 1, source: { name: 'module.js' } };
        const breakpoint2 = { id: 2, verified: true, line: 2, source: { name: 'module.js' } };
        this._breakpoints.set(this.createId(breakpoint1), breakpoint1);
        this._breakpoints.set(this.createId(breakpoint2), breakpoint2);
    }

    get onDidClickBreakpoint(): Event<DebugProtocol.Breakpoint> {
        return this.onDidClickBreakpointEmitter.event;
    }

    get onDidDblClickBreakpoint(): Event<DebugProtocol.Breakpoint> {
        return this.onDidDblClickBreakpointEmitter.event;
    }

    private onBreakpointEvent(event: DebugProtocol.BreakpointEvent): void {
        switch (event.body.reason) {
            case 'new': {
                this.onNewBreakpoint(event.body.breakpoint);
                break;
            }
            case 'removed': {
                this.onBreakpointRemoved(event.body.breakpoint);
                break;
            }
            case 'changed': {
                this.onBreakpointChanged(event.body.breakpoint);
                break;
            }
        }
    }

    private onNewBreakpoint(breakpoint: DebugProtocol.Breakpoint): void {
        this._breakpoints.set(this.createId(breakpoint), breakpoint);
        this.update();
    }

    private onBreakpointRemoved(breakpoint: DebugProtocol.Breakpoint): void {
        this._breakpoints.delete(this.createId(breakpoint));
        this.update();
    }

    private onBreakpointChanged(breakpoint: DebugProtocol.Breakpoint): void {
        this._breakpoints.set(this.createId(breakpoint), breakpoint);
        this.update();
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Breakpoints");
        const items: h.Child = [];

        for (const breakpoint of this._breakpoints.values()) {
            const item =
                h.div({
                    id: this.createId(breakpoint),
                    className: Styles.BREAKPOINT,
                    onclick: event => {
                        const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
                        if (selected) {
                            selected.className = Styles.BREAKPOINT;
                        }
                        (event.target as HTMLDivElement).className = `${Styles.BREAKPOINT} ${SELECTED_CLASS}`;

                        this.onDidClickBreakpointEmitter.fire(breakpoint);
                    },
                    ondblclick: event => this.onDidDblClickBreakpointEmitter.fire(breakpoint),
                }, this.toDisplayName(breakpoint));
            items.push(item);
        }

        return [header, h.div(items)];
    }

    private toDisplayName(breakpoint: DebugProtocol.Breakpoint): string {
        return (breakpoint.source && breakpoint.source.name ? breakpoint.source.name : '')
            + (breakpoint.line ? `:${breakpoint.line}` : '')
            + (breakpoint.column ? `:${breakpoint.column}` : '');
    }

    private createId(breakpoint?: DebugProtocol.Breakpoint): string {
        return `debug-breakpoints-${this.debugSession.sessionId}`
            + (breakpoint
                ? (breakpoint.id
                    ? `-${breakpoint.id}`
                    : ``)
                : '');
    }
}

namespace Styles {
    export const BREAKPOINTS_CONTAINER = 'theia-debug-breakpoints-container';
    export const BREAKPOINT = 'theia-debug-breakpoint';
}
