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
import { DebugSession } from "../debug-session";
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { injectable, inject } from "inversify";
import { Emitter, Event, CommandRegistry } from "@theia/core";
import { DEBUG_SESSION_THREAD_CONTEXT_MENU, DEBUG_COMMANDS } from '../debug-command';

/**
 * Is it used to display list of threads.
 */
@injectable()
export class DebugThreadsWidget extends VirtualWidget {
    private _threads: DebugProtocol.Thread[] = [];
    private _threadId?: number;

    private readonly onDidSelectThreadEmitter = new Emitter<number | undefined>();

    constructor(@inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry) {
        super();
        this.id = this.createId();
        this.addClass(Styles.THREADS_CONTAINER);
        this.node.setAttribute("tabIndex", "0");

        this.debugSession.on('thread', event => this.onThreadEvent(event));
        this.debugSession.on('connected', event => this.refreshThreads());

        if (this.debugSession.debugSessionState.isConnected) {
            this.refreshThreads();
        }
        this.initCommands();
    }

    protected initCommands() {
        this.commandRegistry.registerHandler(DEBUG_COMMANDS.SUSPEND_THREAD.id, {
            execute: () => {
                if (this._threadId) {
                    this.debugSession.pause(this._threadId);
                }
            },
            isEnabled: () => !!this._threadId && !!this.debugSession.debugSessionState.stoppedThreadIds.indexOf(this._threadId),
            isVisible: () => true
        });
        this.commandRegistry.registerHandler(DEBUG_COMMANDS.RESUME_THREAD.id, {
            execute: () => {
                if (this._threadId) {
                    this.debugSession.resume(this._threadId);
                }
            },
            isEnabled: () => !!this._threadId && !this.debugSession.debugSessionState.stoppedThreadIds.indexOf(this._threadId),
            isVisible: () => true
        });
        this.commandRegistry.registerHandler(DEBUG_COMMANDS.RESUME_ALL_THREADS.id, {
            execute: () => {
                if (this.threads.length > 0) {
                    this.debugSession.resume();
                }
            },
            isEnabled: () => this.debugSession.debugSessionState.stoppedThreadIds.length >= 1,
            isVisible: () => true
        });
        this.commandRegistry.registerHandler(DEBUG_COMMANDS.SUSPEND_ALL_THREADS.id, {
            execute: () => {
                if (this.threads.length > 0) {
                    this.debugSession.pause();
                }
            },
            isEnabled: () => this.debugSession.debugSessionState.stoppedThreadIds.length < this._threads.length,
            isVisible: () => true
        });
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
        if (this._threadId === threadId) {
            return;
        }

        if (this.threadId) {
            const element = document.getElementById(this.createId(this.threadId));
            if (element) {
                element.className = Styles.THREAD;
            }
        }

        if (threadId) {
            const element = document.getElementById(this.createId(threadId));
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
                    id: this.createId(thread.id),
                    className,
                    onclick: event => {
                        this.threadId = thread.id;
                        this.onDidSelectThreadEmitter.fire(this.threadId);
                    },
                    oncontextmenu: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.onDidSelectThreadEmitter.fire(this.threadId);
                        this.contextMenuRenderer.render(DEBUG_SESSION_THREAD_CONTEXT_MENU, event);
                    }
                }, thread.name);
            items.push(item);
        }

        return [header, h.div(items)];
    }

    private createId(threadId?: number): string {
        return `debug-threads-${this.debugSession.sessionId}` + (threadId ? `-${threadId}` : '');
    }

    private onThreadEvent(event: DebugProtocol.ThreadEvent): void {
        this.refreshThreads(true);
    }

    private refreshThreads(remainThreadSelected?: boolean): void {
        const selectedThreadId = this.threadId;

        this.threads = [];
        this.threadId = undefined;
        this.onDidSelectThreadEmitter.fire(undefined);

        this.debugSession.threads().then(response => {
            this.threads = response.body.threads;

            const remainThreadExists = this.threads.filter(thread => thread.id === selectedThreadId).length !== 0;
            this.threadId = remainThreadSelected && remainThreadExists
                ? selectedThreadId
                : (this.threads.length ? this.threads[0].id : undefined);

            this.onDidSelectThreadEmitter.fire(this.threadId);
        });
    }
}

export namespace Styles {
    export const THREADS_CONTAINER = 'theia-debug-threads-container';
    export const THREAD = 'theia-debug-thread';
}
