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

/**
 * Is it used to display call stack.
 */
export class DebugStackFramesWidget extends VirtualWidget {
    private _stackFrames: DebugProtocol.StackFrame[] = [];
    private _stackFrameId?: number;
    private _threadId?: number;

    private readonly onDidSelectStackFrameEmitter = new Emitter<number | undefined>();

    constructor(
        protected readonly debugSession: DebugSession) {
        super();
        this.id = this.toDocumentId();
        this.addClass(Styles.STACK_FRAMES_CONTAINER);
        this.node.setAttribute("tabIndex", "0");
        this.debugSession.on('stopped', event => this.onStoppedEvent(event));
        this.debugSession.on('continued', event => this.onContinuedEvent(event));
    }

    get onDidSelectStackFrame(): Event<number | undefined> {
        return this.onDidSelectStackFrameEmitter.event;
    }

    get threadId(): number | undefined {
        return this._threadId;
    }

    set threadId(threadId: number | undefined) {
        if (this.threadId === threadId) {
            return;
        }

        this._threadId = threadId;
        if (threadId) {
            this.refreshStackFrames(threadId);
        } else {
            this.stackFrames = [];
            this.stackFrameId = undefined;
            this.onDidSelectStackFrameEmitter.fire(this.stackFrameId);
        }
    }

    get stackFrames(): DebugProtocol.StackFrame[] {
        return this._stackFrames;
    }

    set stackFrames(stackFrames: DebugProtocol.StackFrame[]) {
        this._stackFrames = stackFrames;
        this.update();
    }

    get stackFrameId(): number | undefined {
        return this._stackFrameId;
    }

    set stackFrameId(stackFrameId: number | undefined) {
        if (this.stackFrameId) {
            const element = document.getElementById(this.toDocumentId(this.stackFrameId));
            if (element) {
                element.className = Styles.STACK_FRAME;
            }
        }

        if (stackFrameId) {
            const element = document.getElementById(this.toDocumentId(stackFrameId));
            if (element) {
                element.className = `${Styles.STACK_FRAME} ${SELECTED_CLASS}`;
            }
        }

        this._stackFrameId = stackFrameId;
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Call stack");
        const items: h.Child = [];

        for (const stackFrame of this._stackFrames) {
            const className = Styles.STACK_FRAME + (stackFrame.id === this.stackFrameId ? ` ${SELECTED_CLASS}` : '');

            const item =
                h.div({
                    id: this.toDocumentId(stackFrame.id),
                    className,
                    onclick: event => {
                        this.stackFrameId = stackFrame.id;
                        this.onDidSelectStackFrameEmitter.fire(this.stackFrameId);
                    }
                }, this.toDisplayName(stackFrame));

            items.push(item);
        }

        return [header, h.div(items)];
    }

    private toDisplayName(stackFrame: DebugProtocol.StackFrame): string {
        return stackFrame.name;
    }

    private toDocumentId(stackFrameId?: number): string {
        return `debug-stack-frames-${this.debugSession.sessionId}` + (stackFrameId ? `-${stackFrameId}` : '');
    }

    private onContinuedEvent(event: DebugProtocol.ContinuedEvent): void {
        if (this.threadId) {
            if (this.threadId === event.body.threadId || event.body.allThreadsContinued) {
                this.stackFrames = [];
                this.stackFrameId = undefined;
                this.onDidSelectStackFrameEmitter.fire(this.stackFrameId);
            }
        }
    }

    private onStoppedEvent(event: DebugProtocol.StoppedEvent): void {
        if (this.threadId) {
            if (this.threadId === event.body.threadId || event.body.allThreadsStopped) {
                this.refreshStackFrames(this.threadId);
            }
        }
    }

    private refreshStackFrames(threadId: number) {
        this.stackFrames = [];
        this.stackFrameId = undefined;
        this.onDidSelectStackFrameEmitter.fire(this.stackFrameId);

        this.debugSession.stacks(threadId).then(response => {
            if (this.threadId === threadId) { // still the same thread remains selected
                this.stackFrames = response.body.stackFrames;
                this.stackFrameId = this.stackFrames.length ? this.stackFrames[0].id : undefined;
                this.onDidSelectStackFrameEmitter.fire(this.stackFrameId);
            }
        });
    }
}

namespace Styles {
    export const DEBUG_PANEL = 'theia-debug-panel';
    export const DEBUG_TARGET = 'theia-debug-target';
    export const THREADS_CONTAINER = 'theia-debug-threads-container';
    export const THREAD = 'theia-debug-thread';
    export const STACK_FRAMES_CONTAINER = 'theia-debug-stack-frames-container';
    export const STACK_FRAME = 'theia-debug-stack-frame';
}
