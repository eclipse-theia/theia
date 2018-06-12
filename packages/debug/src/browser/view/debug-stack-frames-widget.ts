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
import { injectable, inject } from "inversify";
import { DebugSelection } from "./debug-selection-service";
import { hasSameId } from "../../common/debug-utils";

/**
 * Is it used to display call stack.
 */
@injectable()
export class DebugStackFramesWidget extends VirtualWidget {
    private _frames: DebugProtocol.StackFrame[] = [];

    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(DebugSelection) protected readonly debugSelection: DebugSelection) {
        super();

        this.id = this.createId();
        this.addClass(Styles.FRAMES_CONTAINER);
        this.node.setAttribute("tabIndex", "0");
        this.debugSession.on('stopped', event => this.onStoppedEvent(event));
        this.debugSession.on('continued', event => this.onContinuedEvent(event));
        this.debugSelection.onDidSelectThread(thread => this.onThreadSelected(thread));
    }

    get frames(): DebugProtocol.StackFrame[] {
        return this._frames;
    }

    set frames(frames: DebugProtocol.StackFrame[]) {
        this._frames = frames;
        this.update();
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Call stack");
        const items: h.Child = [];

        for (const frame of this._frames) {
            const className = Styles.FRAME + (hasSameId(this.debugSelection.frame, frame) ? ` ${SELECTED_CLASS}` : '');
            const id = this.createId(frame);

            const item =
                h.div({
                    id, className,
                    onclick: () => this.selectFrame(frame)
                }, this.toDisplayName(frame));

            items.push(item);
        }

        return [header, h.div(items)];
    }

    protected onThreadSelected(thread: DebugProtocol.Thread | undefined) {
        this.updateFrames(thread ? thread.id : undefined);
    }

    protected selectFrame(newFrame: DebugProtocol.StackFrame | undefined) {
        const currentFrame = this.debugSelection.frame;

        if (hasSameId(currentFrame, newFrame)) {
            return;
        }

        if (currentFrame) {
            const element = document.getElementById(this.createId(currentFrame));
            if (element) {
                element.className = Styles.FRAME;
            }
        }

        if (newFrame) {
            const element = document.getElementById(this.createId(newFrame));
            if (element) {
                element.className = `${Styles.FRAME} ${SELECTED_CLASS}`;
            }
        }

        this.debugSelection.frame = newFrame;
    }

    private toDisplayName(frame: DebugProtocol.StackFrame): string {
        return frame.name;
    }

    private createId(frame?: DebugProtocol.StackFrame): string {
        return `debug-stack-frames-${this.debugSession.sessionId}` + (frame ? `-${frame.id}` : '');
    }

    private onContinuedEvent(event: DebugProtocol.ContinuedEvent): void {
        const currentThread = this.debugSelection.thread;
        if (currentThread) {
            if (hasSameId(currentThread, event.body.threadId) || event.body.allThreadsContinued) {
                this.frames = [];
                this.selectFrame(undefined);
            }
        }
    }

    private onStoppedEvent(event: DebugProtocol.StoppedEvent): void {
        const currentThread = this.debugSelection.thread;
        if (currentThread) {
            if (hasSameId(currentThread, event.body.threadId) || event.body.allThreadsStopped) {
                this.updateFrames(currentThread.id);
            }
        }
    }

    private updateFrames(threadId: number | undefined) {
        this.frames = [];
        this.selectFrame(undefined);

        if (threadId) {
            this.debugSession.stacks(threadId).then(response => {
                if (hasSameId(this.debugSelection.thread, threadId)) { // still the same thread remains selected
                    this.frames = response.body.stackFrames;
                    this.selectFrame(this.frames[0]);
                }
            });
        }
    }
}

namespace Styles {
    export const FRAMES_CONTAINER = 'theia-debug-frames-container';
    export const FRAME = 'theia-debug-frame';
}
