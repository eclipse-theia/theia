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
    SELECTED_CLASS,
} from "@theia/core/lib/browser";
import { DebugSession } from "../debug-model";
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { injectable, inject } from "inversify";
import { DebugSelection } from "./debug-selection-service";
import { SourceOpener, DebugUtils } from "../debug-utils";

/**
 * Is it used to display call stack.
 */
@injectable()
export class DebugStackFramesWidget extends VirtualWidget {
    private _frames: DebugProtocol.StackFrame[] = [];

    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(DebugSelection) protected readonly debugSelection: DebugSelection,
        @inject(SourceOpener) protected readonly sourceOpener: SourceOpener) {
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
            const className = Styles.FRAME + (DebugUtils.isEqual(this.debugSelection.frame, frame) ? ` ${SELECTED_CLASS}` : '');
            const id = this.createId(frame);

            const item =
                h.div({
                    id, className,
                    onclick: () => {
                        this.selectFrame(frame);
                        this.sourceOpener.open(frame);
                    }
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

        if (DebugUtils.isEqual(currentFrame, newFrame)) {
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
            if (DebugUtils.isEqual(currentThread, event.body.threadId) || event.body.allThreadsContinued) {
                this.frames = [];
                this.selectFrame(undefined);
            }
        }
    }

    private onStoppedEvent(event: DebugProtocol.StoppedEvent): void {
        const currentThread = this.debugSelection.thread;
        if (currentThread) {
            if (DebugUtils.isEqual(currentThread, event.body.threadId) || event.body.allThreadsStopped) {
                this.updateFrames(currentThread.id);
            }
        }
    }

    private updateFrames(threadId: number | undefined) {
        this.frames = [];
        this.selectFrame(undefined);

        if (threadId) {
            const args: DebugProtocol.StackTraceArguments = { threadId };
            this.debugSession.stacks(args).then(response => {
                if (DebugUtils.isEqual(this.debugSelection.thread, threadId)) { // still the same thread remains selected
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
