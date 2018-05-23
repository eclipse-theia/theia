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

import { VirtualWidget, SELECTED_CLASS } from "@theia/core/lib/browser";
import { DebugSession } from "../debug-session";
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Emitter, Event } from "@theia/core";

/**
 * Is it used to display list of threads.
 */
export class DebugThreadsWidget extends VirtualWidget {
    private _threads: DebugProtocol.Thread[] = [];
    private _threadId?: number;

    private readonly onDidSelectThreadEmitter = new Emitter<number | undefined>();

    constructor(protected readonly debugSession: DebugSession) {
        super();
        this.id = this.toDocumentId();
        this.addClass(Styles.THREADS_CONTAINER);
        this.node.setAttribute("tabIndex", "0");
        this.debugSession.on('thread', event => this.onThreadEvent(event));
        this.debugSession.on('connected', event => this.refreshThreads());
    }

    get threads(): DebugProtocol.Thread[] {
        return this._threads;
    }

    set threads(threads: DebugProtocol.Thread[]) {
        this._threads = threads;
        this.update();
    }

    get threadId(): number | undefined {
        return this._threadId;
    }

    set threadId(threadId: number | undefined) {
        if (this.threadId) {
            const element = document.getElementById(this.toDocumentId(this.threadId));
            if (element) {
                element.className = Styles.THREAD;
            }
        }

        if (threadId) {
            const element = document.getElementById(this.toDocumentId(threadId));
            if (element) {
                element.className = `${Styles.THREAD} ${SELECTED_CLASS}`;
            }
        }

        this._threadId = threadId;
    }

    get onDidSelectThread(): Event<number | undefined> {
        return this.onDidSelectThreadEmitter.event;
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Threads");
        const items: h.Child = [];

        for (const thread of this.threads) {
            const className = Styles.THREAD + (thread.id === this.threadId ? ` ${SELECTED_CLASS}` : '');

            const item =
                h.div({
                    id: this.toDocumentId(thread.id),
                    className,
                    onclick: event => {
                        this.threadId = thread.id;
                        this.onDidSelectThreadEmitter.fire(this.threadId);
                    }
                }, thread.name);
            items.push(item);
        }

        return [header, h.div(items)];
    }

    private toDocumentId(threadId?: number): string {
        return `debug-threads-${this.debugSession.sessionId}` + (threadId ? `-${threadId}` : '');
    }

    private onThreadEvent(event: DebugProtocol.ThreadEvent): void {
        this.refreshThreads(this.threadId);
    }

    private refreshThreads(threadId2select?: number) {
        if (this.threads.length) {
            this.threads = [];
            this.threadId = undefined;
            this.onDidSelectThreadEmitter.fire(this.threadId);
        }

        this.debugSession.threads().then(response => {
            this.threads = response.body.threads;
            this.threadId = threadId2select
                ? threadId2select
                : (this.threads.length
                    ? this.threads[0].id
                    : undefined);
            this.onDidSelectThreadEmitter.fire(this.threadId);
        });
    }
}

export namespace Styles {
    export const DEBUG_PANEL = 'theia-debug-panel';
    export const DEBUG_TARGET = 'theia-debug-target';
    export const THREADS_CONTAINER = 'theia-debug-threads-container';
    export const THREAD = 'theia-debug-thread';
    export const STACK_FRAMES_CONTAINER = 'theia-debug-stack-frames-container';
    export const STACK_FRAME = 'theia-debug-stack-frame';
}
