// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import debounce from 'p-debounce';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, Event, Emitter } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { DebugSession, DebugState } from '../debug-session';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugThread } from '../model/debug-thread';
import { DebugStackFrame } from '../model/debug-stack-frame';
import { DebugSourceBreakpoint } from '../model/debug-source-breakpoint';
import { DebugWatchExpression } from './debug-watch-expression';
import { DebugWatchManager } from '../debug-watch-manager';
import { DebugFunctionBreakpoint } from '../model/debug-function-breakpoint';
import { DebugInstructionBreakpoint } from '../model/debug-instruction-breakpoint';

@injectable()
export class DebugViewModel implements Disposable {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.refreshWatchExpressions();
        this.onDidChangeEmitter.fire(undefined);
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<URI>();
    readonly onDidChangeBreakpoints: Event<URI> = this.onDidChangeBreakpointsEmitter.event;
    protected fireDidChangeBreakpoints(uri: URI): void {
        this.onDidChangeBreakpointsEmitter.fire(uri);
    }

    protected readonly _watchExpressions = new Map<number, DebugWatchExpression>();

    protected readonly onDidChangeWatchExpressionsEmitter = new Emitter<void>();
    readonly onDidChangeWatchExpressions = this.onDidChangeWatchExpressionsEmitter.event;
    protected fireDidChangeWatchExpressions(): void {
        this.onDidChangeWatchExpressionsEmitter.fire(undefined);
    }

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeEmitter,
        this.onDidChangeBreakpointsEmitter,
        this.onDidChangeWatchExpressionsEmitter,
    );

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    @inject(DebugWatchManager)
    protected readonly watch: DebugWatchManager;

    get sessions(): IterableIterator<DebugSession> {
        return this.manager.sessions[Symbol.iterator]();
    }
    get sessionCount(): number {
        return this.manager.sessions.length;
    }
    get session(): DebugSession | undefined {
        return this.currentSession;
    }
    get id(): string {
        return this.session && this.session.id || '-1';
    }
    get label(): string {
        return this.session && this.session.label || 'Unknown Session';
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.manager.onDidChangeActiveDebugSession(() => {
            this.fireDidChange();
        }));
        this.toDispose.push(this.manager.onDidChange(current => {
            if (current === this.currentSession) {
                this.fireDidChange();
            }
        }));
        this.toDispose.push(this.manager.onDidChangeBreakpoints(({ session, uri }) => {
            if (!session || session === this.currentSession) {
                this.fireDidChangeBreakpoints(uri);
            }
        }));
        this.updateWatchExpressions();
        this.toDispose.push(this.watch.onDidChange(() => this.updateWatchExpressions()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get currentSession(): DebugSession | undefined {
        const { currentSession } = this.manager;
        return currentSession;
    }
    set currentSession(currentSession: DebugSession | undefined) {
        this.manager.currentSession = currentSession;
    }

    get state(): DebugState {
        const { currentSession } = this;
        return currentSession && currentSession.state || DebugState.Inactive;
    }
    get currentThread(): DebugThread | undefined {
        const { currentSession } = this;
        return currentSession && currentSession.currentThread;
    }
    get currentFrame(): DebugStackFrame | undefined {
        const { currentThread } = this;
        return currentThread && currentThread.currentFrame;
    }

    get breakpoints(): DebugSourceBreakpoint[] {
        return this.manager.getBreakpoints(this.currentSession);
    }

    get functionBreakpoints(): DebugFunctionBreakpoint[] {
        return this.manager.getFunctionBreakpoints(this.currentSession);
    }

    get instructionBreakpoints(): DebugInstructionBreakpoint[] {
        return this.manager.getInstructionBreakpoints(this.currentSession);
    }

    async start(): Promise<void> {
        const { session } = this;
        if (!session) {
            return;
        }
        const newSession = await this.manager.start(session.options);
        if (newSession) {
            this.fireDidChange();
        }
    }

    async restart(): Promise<void> {
        const { session } = this;
        if (!session) {
            return;
        }
        await this.manager.restartSession(session);
        this.fireDidChange();
    }

    async terminate(): Promise<void> {
        this.manager.terminateSession();
    }

    get watchExpressions(): IterableIterator<DebugWatchExpression> {
        return this._watchExpressions.values();
    }

    async addWatchExpression(expression: string = ''): Promise<DebugWatchExpression | undefined> {
        const watchExpression: DebugWatchExpression = new DebugWatchExpression({
            id: Number.MAX_SAFE_INTEGER,
            expression,
            session: () => this.currentSession,
            remove: () => this.removeWatchExpression(watchExpression),
            onDidChange: () => { /* no-op */ },
        });
        await watchExpression.open();
        if (!watchExpression.expression) {
            return undefined;
        }
        const id = this.watch.addWatchExpression(watchExpression.expression);
        return this._watchExpressions.get(id);
    }

    removeWatchExpressions(): void {
        this.watch.removeWatchExpressions();
    }

    removeWatchExpression(expression: DebugWatchExpression): void {
        this.watch.removeWatchExpression(expression.id);
    }

    protected updateWatchExpressions(): void {
        let added = false;
        const toRemove = new Set(this._watchExpressions.keys());
        for (const [id, expression] of this.watch.watchExpressions) {
            toRemove.delete(id);
            if (!this._watchExpressions.has(id)) {
                added = true;
                const watchExpression: DebugWatchExpression = new DebugWatchExpression({
                    id,
                    expression,
                    session: () => this.currentSession,
                    remove: () => this.removeWatchExpression(watchExpression),
                    onDidChange: () => this.fireDidChangeWatchExpressions()
                });
                this._watchExpressions.set(id, watchExpression);
                watchExpression.evaluate();
            }
        }
        for (const id of toRemove) {
            this._watchExpressions.delete(id);
        }
        if (added || toRemove.size) {
            this.fireDidChangeWatchExpressions();
        }
    }

    protected refreshWatchExpressionsQueue = Promise.resolve();
    protected refreshWatchExpressions = debounce(() => {
        this.refreshWatchExpressionsQueue = this.refreshWatchExpressionsQueue.then(async () => {
            try {
                for (const watchExpression of this.watchExpressions) {
                    await watchExpression.evaluate();
                }
            } catch (e) {
                console.error('Failed to refresh watch expressions: ', e);
            }
        });
    }, 50);

}
