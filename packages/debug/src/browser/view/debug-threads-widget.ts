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

import { VirtualWidget, SELECTED_CLASS, ContextMenuRenderer } from '@theia/core/lib/browser';
import { DebugSession } from '../debug-model';
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { injectable, inject, postConstruct } from 'inversify';
import { DEBUG_SESSION_THREAD_CONTEXT_MENU } from '../debug-command';
import { DebugSelection } from './debug-selection-service';
import { DebugUtils } from '../debug-utils';
import { Disposable } from '@theia/core';

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
        this.addClass('theia-debug-entry');
        this.node.setAttribute('tabIndex', '0');
    }

    @postConstruct()
    protected init() {
        const threadEventListener = (event: DebugProtocol.ThreadEvent) => this.onThreadEvent(event);
        const connectedEventListener = () => this.updateThreads();

        this.debugSession.on('thread', threadEventListener);
        this.debugSession.on('connected', connectedEventListener);

        this.toDisposeOnDetach.push(Disposable.create(() => this.debugSession.removeListener('thread', threadEventListener)));
        this.toDisposeOnDetach.push(Disposable.create(() => this.debugSession.removeListener('connected', connectedEventListener)));

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
        const header = h.div({ className: 'theia-debug-header' }, 'Threads');
        const items: h.Child = [];

        for (const thread of this.threads) {
            const className = Styles.THREAD_ITEM + (DebugUtils.isEqual(this.debugSelection.thread, thread) ? ` ${SELECTED_CLASS}` : '');
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

        return [header, h.div({ className: Styles.THREADS }, items)];
    }

    protected selectThread(newThread: DebugProtocol.Thread | undefined) {
        const currentThread = this.debugSelection.thread;

        if (DebugUtils.isEqual(currentThread, newThread)) {
            return;
        }

        if (currentThread) {
            const element = document.getElementById(this.createId(currentThread));
            if (element) {
                element.className = Styles.THREAD_ITEM;
            }
        }

        if (newThread) {
            const element = document.getElementById(this.createId(newThread));
            if (element) {
                element.className = `${Styles.THREAD_ITEM} ${SELECTED_CLASS}`;
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

            const currentThreadExists = this.threads.some(thread => DebugUtils.isEqual(thread, currentThread));
            this.selectThread(currentThreadExists ? currentThread : this.threads[0]);
        });
    }
}

namespace Styles {
    export const THREADS = 'theia-debug-threads';
    export const THREAD_ITEM = 'theia-debug-thread-item';
}
