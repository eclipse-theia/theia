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
 * Is it used to display call stack.
 */
@injectable()
export class DebugStackFramesWidget extends VirtualWidget {
    private _frames: DebugProtocol.StackFrame[] = [];
    private _frameId?: number;
    private _threadId?: number;

    private readonly onDidSelectFrameEmitter = new Emitter<number | undefined>();

    constructor(@inject(DebugSession) protected readonly debugSession: DebugSession) {
        super();
        this.id = this.createId();
        this.addClass(Styles.FRAMES_CONTAINER);
        this.node.setAttribute("tabIndex", "0");
        this.debugSession.on('stopped', event => this.onStoppedEvent(event));
        this.debugSession.on('continued', event => this.onContinuedEvent(event));
    }

    get onDidSelectFrame(): Event<number | undefined> {
        return this.onDidSelectFrameEmitter.event;
    }

    get threadId(): number | undefined {
        return this._threadId;
    }

    set threadId(threadId: number | undefined) {
        if (this._threadId === threadId) {
            return;
        }

        this._threadId = threadId;
        if (threadId) {
            this.refreshFrames(threadId);
        } else {
            this.frames = [];
            this.frameId = undefined;
            this.onDidSelectFrameEmitter.fire(this.frameId);
        }
    }

    get frames(): DebugProtocol.StackFrame[] {
        return this._frames;
    }

    set frames(frames: DebugProtocol.StackFrame[]) {
        this._frames = frames;
        this.update();
    }

    get frameId(): number | undefined {
        return this._frameId;
    }

    set frameId(frameId: number | undefined) {
        if (this.frameId) {
            const element = document.getElementById(this.createId(this.frameId));
            if (element) {
                element.className = Styles.FRAME;
            }
        }

        if (frameId) {
            const element = document.getElementById(this.createId(frameId));
            if (element) {
                element.className = `${Styles.FRAME} ${SELECTED_CLASS}`;
            }
        }

        this._frameId = frameId;
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Call stack");
        const items: h.Child = [];

        for (const frame of this._frames) {
            const className = Styles.FRAME + (frame.id === this.frameId ? ` ${SELECTED_CLASS}` : '');

            const item =
                h.div({
                    id: this.createId(frame.id),
                    className,
                    onclick: event => {
                        this.frameId = frame.id;
                        this.onDidSelectFrameEmitter.fire(this.frameId);
                    }
                }, this.toDisplayName(frame));

            items.push(item);
        }

        return [header, h.div(items)];
    }

    private toDisplayName(frame: DebugProtocol.StackFrame): string {
        return frame.name;
    }

    private createId(frameId?: number): string {
        return `debug-stack-frames-${this.debugSession.sessionId}` + (frameId ? `-${frameId}` : '');
    }

    private onContinuedEvent(event: DebugProtocol.ContinuedEvent): void {
        if (this.threadId) {
            if (this.threadId === event.body.threadId || event.body.allThreadsContinued) {
                this.frames = [];
                this.frameId = undefined;
                this.onDidSelectFrameEmitter.fire(this.frameId);
            }
        }
    }

    private onStoppedEvent(event: DebugProtocol.StoppedEvent): void {
        if (this.threadId) {
            if (this.threadId === event.body.threadId || event.body.allThreadsStopped) {
                this.refreshFrames(this.threadId);
            }
        }
    }

    private refreshFrames(threadId: number) {
        this.frames = [];
        this.frameId = undefined;
        this.onDidSelectFrameEmitter.fire(this.frameId);

        this.debugSession.stacks(threadId).then(response => {
            if (this.threadId === threadId) { // still the same thread remains selected
                this.frames = response.body.stackFrames;
                this.frameId = this.frames.length ? this.frames[0].id : undefined;
                this.onDidSelectFrameEmitter.fire(this.frameId);
            }
        });
    }
}

namespace Styles {
    export const FRAMES_CONTAINER = 'theia-debug-frames-container';
    export const FRAME = 'theia-debug-frame';
}
