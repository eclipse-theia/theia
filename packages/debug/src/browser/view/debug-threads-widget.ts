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

import { VirtualWidget, SELECTED_CLASS, ContextMenuRenderer } from "@theia/core/lib/browser";
import { DebugSession } from "../debug-model";
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { injectable, inject, postConstruct } from "inversify";
import { DEBUG_SESSION_THREAD_CONTEXT_MENU } from "../debug-command";
import { hasSameId } from "../../common/debug-utils";
import { DebugSelection } from "./debug-selection-service";

/**
 * Is it used to display list of threads.
 */
@injectable()
export class DebugThreadsWidget extends VirtualWidget {
    private _threads: DebugProtocol.Thread[] = [];

    constructor(
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(DebugSelection) protected readonly debugSelection: DebugSelection,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
        super();

        this.id = this.createId();
        this.addClass(Styles.THREADS_CONTAINER);
        this.node.setAttribute("tabIndex", "0");

        this.debugSession.on('thread', event => this.onThreadEvent(event));
        this.debugSession.on('connected', () => this.updateThreads());
    }

    @postConstruct()
    protected init() {
        if (this.debugSession.state.isConnected) {
            this.updateThreads();
        }
    }

    get threads(): DebugProtocol.Thread[] {
        return this._threads;
    }

    set threads(threads: DebugProtocol.Thread[]) {
        this._threads = threads;
        this.update();
    }

    protected render(): h.Child {
        const header = h.div({ className: "theia-header" }, "Threads");
        const items: h.Child = [];

        for (const thread of this.threads) {
            const className = Styles.THREAD + (hasSameId(this.debugSelection.thread, thread) ? ` ${SELECTED_CLASS}` : '');
            const id = this.createId(thread);

            const item =
                h.div({
                    id, className,
                    onclick: () => this.selectThread(thread),
                    oncontextmenu: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.selectThread(thread);
                        this.contextMenuRenderer.render(DEBUG_SESSION_THREAD_CONTEXT_MENU, event);
                    }
                }, thread.name);
            items.push(item);
        }

        return [header, h.div(items)];
    }

    protected selectThread(newThread: DebugProtocol.Thread | undefined) {
        const currentThread = this.debugSelection.thread;

        if (hasSameId(currentThread, newThread)) {
            return;
        }

        if (currentThread) {
            const element = document.getElementById(this.createId(currentThread));
            if (element) {
                element.className = Styles.THREAD;
            }
        }

        if (newThread) {
            const element = document.getElementById(this.createId(newThread));
            if (element) {
                element.className = `${Styles.THREAD} ${SELECTED_CLASS}`;
            }
        }

        this.debugSelection.thread = newThread;
    }

    private createId(thread?: DebugProtocol.Thread): string {
        return `debug-threads-${this.debugSession.sessionId}` + (thread ? `-${thread.id}` : '');
    }

    private onThreadEvent(event: DebugProtocol.ThreadEvent): void {
        this.updateThreads();
    }

    private updateThreads(): void {
        const currentThread = this.debugSelection.thread;

        this.threads = [];
        this.selectThread(undefined);

        this.debugSession.threads().then(response => {
            this.threads = response.body.threads;

            const currentThreadExists = this.threads.some(thread => hasSameId(thread, currentThread));
            this.selectThread(currentThreadExists ? currentThread : this.threads[0]);
        });
    }
}

namespace Styles {
    export const THREADS_CONTAINER = 'theia-debug-threads-container';
    export const THREAD = 'theia-debug-thread';
}
