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
import { injectable, inject } from 'inversify';
import { DEBUG_SESSION_THREAD_CONTEXT_MENU } from '../debug-command';
import { DebugSelection } from './debug-selection-service';
import { DebugUtils } from '../debug-utils';
import { Disposable, DisposableCollection } from '@theia/core';
import { DebugStyles, DebugWidget, DebugContext } from './debug-view-common';

/**
 * Is it used to display list of threads.
 */
@injectable()
export class DebugThreadsWidget extends VirtualWidget implements DebugWidget {
    private _debugContext: DebugContext | undefined;
    private _threads: DebugProtocol.Thread[] = [];

    private readonly sessionDisposableEntries = new DisposableCollection();

    constructor(@inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
        super();

        this.id = this.createId();
        this.addClass('theia-debug-entry');
        this.node.setAttribute('tabIndex', '0');
    }

    dispose(): void {
        this.sessionDisposableEntries.dispose();
        super.dispose();
    }

    get debugContext(): DebugContext | undefined {
        return this._debugContext;
    }

    set debugContext(debugContext: DebugContext | undefined) {
        this.sessionDisposableEntries.dispose();
        this._debugContext = debugContext;
        this.id = this.createId();

        if (debugContext) {
            const threadEventListener = (event: DebugProtocol.ThreadEvent) => this.onThreadEvent(event);
            const connectedEventListener = () => this.updateThreads();
            const terminatedEventListener = (event: DebugProtocol.TerminatedEvent) => this.onTerminatedEvent(event);
            const stoppedEventListener = (event: DebugProtocol.StoppedEvent) => this.onStoppedEvent(event);

            this.debugSession!.on('thread', threadEventListener);
            this.debugSession!.on('configurationDone', connectedEventListener);
            this.debugSession!.on('terminated', terminatedEventListener);
            this.debugSession!.on('stopped', stoppedEventListener);

            this.sessionDisposableEntries.push(Disposable.create(() => this.debugSession!.removeListener('thread', threadEventListener)));
            this.sessionDisposableEntries.push(Disposable.create(() => this.debugSession!.removeListener('configurationDone', connectedEventListener)));
            this.sessionDisposableEntries.push(Disposable.create(() => this.debugSession!.removeListener('terminated', terminatedEventListener)));
            this.sessionDisposableEntries.push(Disposable.create(() => this.debugSession!.removeListener('stopped', stoppedEventListener)));

            if (this.debugSession!.state.isConnected) {
                this.updateThreads();
            }
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

        const selectedThread = this.debugSelection && this.debugSelection.thread;
        for (const thread of this.threads) {
            const className = DebugStyles.DEBUG_ITEM + (DebugUtils.isEqual(selectedThread, thread) ? ` ${SELECTED_CLASS}` : '');
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
        if (!this.debugSelection) {
            return;
        }

        const currentThread = this.debugSelection.thread;

        if (DebugUtils.isEqual(currentThread, newThread)) {
            return;
        }

        if (currentThread) {
            const element = document.getElementById(this.createId(currentThread));
            if (element) {
                element.className = DebugStyles.DEBUG_ITEM;
            }
        }

        if (newThread) {
            const element = document.getElementById(this.createId(newThread));
            if (element) {
                element.className = `${DebugStyles.DEBUG_ITEM} ${SELECTED_CLASS}`;
            }
        }

        this.debugSelection.thread = newThread;
    }

    private createId(thread?: DebugProtocol.Thread): string {
        return 'debug-threads'
            + (this.debugSession ? `-${this.debugSession.sessionId}` : '')
            + (thread ? `-${thread.id}` : '');
    }

    protected onTerminatedEvent(event: DebugProtocol.TerminatedEvent): void {
        this.threads = [];
    }

    protected onStoppedEvent(event: DebugProtocol.StoppedEvent): void {
        this.updateThreads();
    }

    private onThreadEvent(event: DebugProtocol.ThreadEvent): void {
        this.updateThreads();
    }

    private updateThreads(): void {
        const currentThread = this.debugSelection && this.debugSelection.thread;

        this.threads = [];
        this.selectThread(undefined);

        if (this.debugSession) {
            this.debugSession.threads().then(response => {
                this.threads = response.body.threads;

                const currentThreadExists = this.threads.some(thread => DebugUtils.isEqual(thread, currentThread));
                this.selectThread(currentThreadExists ? currentThread : this.threads[0]);
            });
        }
    }

    private get debugSession(): DebugSession | undefined {
        return this._debugContext && this._debugContext.debugSession;
    }

    private get debugSelection(): DebugSelection | undefined {
        return this._debugContext && this._debugContext.debugSelection;
    }
}

namespace Styles {
    export const THREADS = 'theia-debug-threads';
}
