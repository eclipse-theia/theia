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

// tslint:disable:no-any

import { injectable, inject, postConstruct } from 'inversify';
import { Emitter, Event, DisposableCollection, MessageService } from '@theia/core';
import { LabelProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { DebugError, DebugService } from '../common/debug-service';
import { DebugState, DebugSession } from './debug-session';
import { DebugSessionFactory, DebugSessionContributionRegistry } from './debug-session-contribution';
import { DebugThread } from './model/debug-thread';
import { DebugStackFrame } from './model/debug-stack-frame';
import { DebugBreakpoint } from './model/debug-breakpoint';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import URI from '@theia/core/lib/common/uri';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { DebugSessionOptions, InternalDebugSessionOptions } from './debug-session-options';

export interface DidChangeActiveDebugSession {
    previous: DebugSession | undefined
    current: DebugSession | undefined
}

export interface DidChangeBreakpointsEvent {
    session?: DebugSession
    uri: URI
}

export interface DebugSessionCustomEvent {
    readonly body?: any
    readonly event: string
    readonly session: DebugSession
}

@injectable()
export class DebugSessionManager {
    protected readonly _sessions = new Map<string, DebugSession>();

    protected readonly onDidCreateDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidCreateDebugSession: Event<DebugSession> = this.onDidCreateDebugSessionEmitter.event;

    protected readonly onDidStartDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidStartDebugSession: Event<DebugSession> = this.onDidStartDebugSessionEmitter.event;

    protected readonly onDidStopDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidStopDebugSession: Event<DebugSession> = this.onDidStopDebugSessionEmitter.event;

    protected readonly onDidChangeActiveDebugSessionEmitter = new Emitter<DidChangeActiveDebugSession>();
    readonly onDidChangeActiveDebugSession: Event<DidChangeActiveDebugSession> = this.onDidChangeActiveDebugSessionEmitter.event;

    protected readonly onDidDestroyDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidDestroyDebugSession: Event<DebugSession> = this.onDidDestroyDebugSessionEmitter.event;

    protected readonly onDidReceiveDebugSessionCustomEventEmitter = new Emitter<DebugSessionCustomEvent>();
    readonly onDidReceiveDebugSessionCustomEvent: Event<DebugSessionCustomEvent> = this.onDidReceiveDebugSessionCustomEventEmitter.event;

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<DidChangeBreakpointsEvent>();
    readonly onDidChangeBreakpoints: Event<DidChangeBreakpointsEvent> = this.onDidChangeBreakpointsEmitter.event;
    protected fireDidChangeBreakpoints(event: DidChangeBreakpointsEvent): void {
        this.onDidChangeBreakpointsEmitter.fire(event);
    }

    protected readonly onDidChangeEmitter = new Emitter<DebugSession | undefined>();
    readonly onDidChange: Event<DebugSession | undefined> = this.onDidChangeEmitter.event;
    protected fireDidChange(current: DebugSession | undefined): void {
        this.onDidChangeEmitter.fire(current);
    }

    @inject(DebugSessionFactory)
    protected readonly debugSessionFactory: DebugSessionFactory;

    @inject(DebugService)
    protected readonly debug: DebugService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    @inject(VariableResolverService)
    protected readonly variableResolver: VariableResolverService;

    @inject(DebugSessionContributionRegistry)
    protected readonly sessionContributionRegistry: DebugSessionContributionRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @postConstruct()
    protected init(): void {
        this.breakpoints.onDidChangeMarkers(uri => this.fireDidChangeBreakpoints({ uri }));
    }

    async start(options: DebugSessionOptions): Promise<DebugSession | undefined> {
        try {
            const resolved = await this.resolveConfiguration(options);
            const sessionId = await this.debug.createDebugSession(resolved.configuration);
            return this.doStart(sessionId, resolved);
        } catch (e) {
            if (DebugError.NotFound.is(e)) {
                this.messageService.error(`The debug session type "${e.data.type}" is not supported.`);
                return undefined;
            }

            this.messageService.error('There was an error starting the debug session, check the logs for more details.');
            console.error('Error starting the debug session', e);
            throw e;
        }
    }
    protected configurationIds = new Map<string, number>();
    protected async resolveConfiguration(options: Readonly<DebugSessionOptions>): Promise<InternalDebugSessionOptions> {
        if (InternalDebugSessionOptions.is(options)) {
            return options;
        }
        const { workspaceFolderUri } = options;
        const resolvedConfiguration = await this.debug.resolveDebugConfiguration(options.configuration, workspaceFolderUri);
        const configuration = await this.variableResolver.resolve(resolvedConfiguration);
        const key = configuration.name + workspaceFolderUri;
        const id = this.configurationIds.has(key) ? this.configurationIds.get(key)! + 1 : 0;
        this.configurationIds.set(key, id);
        return {
            id,
            configuration,
            workspaceFolderUri
        };
    }
    protected async doStart(sessionId: string, options: DebugSessionOptions): Promise<DebugSession> {
        const contrib = this.sessionContributionRegistry.get(options.configuration.type);
        const sessionFactory = contrib ? contrib.debugSessionFactory() : this.debugSessionFactory;
        const session = sessionFactory.get(sessionId, options);
        this._sessions.set(sessionId, session);

        this.onDidCreateDebugSessionEmitter.fire(session);

        let state = DebugState.Inactive;
        session.onDidChange(() => {
            if (state !== session.state) {
                state = session.state;
                if (state === DebugState.Stopped) {
                    this.onDidStopDebugSessionEmitter.fire(session);
                }
            }
            this.updateCurrentSession(session);
        });
        session.onDidChangeBreakpoints(uri => this.fireDidChangeBreakpoints({ session, uri }));
        session.on('terminated', event => {
            const restart = event.body && event.body.restart;
            if (restart) {
                this.doRestart(session, restart);
            } else {
                session.terminate();
            }
        });
        session.on('exited', () => this.destroy(session.id));
        session.start().then(() => this.onDidStartDebugSessionEmitter.fire(session));
        session.onDidCustomEvent(({ event, body }) =>
            this.onDidReceiveDebugSessionCustomEventEmitter.fire({ event, body, session })
        );
        return session;
    }

    restart(): Promise<DebugSession | undefined>;
    restart(session: DebugSession): Promise<DebugSession>;
    async restart(session: DebugSession | undefined = this.currentSession): Promise<DebugSession | undefined> {
        return session && this.doRestart(session);
    }
    protected async doRestart(session: DebugSession, restart?: any): Promise<DebugSession | undefined> {
        if (await session.restart()) {
            return session;
        }
        await session.terminate(!!restart);
        const { options, configuration } = session;
        configuration.__restart = restart;
        return this.start(options);
    }

    protected remove(sessionId: string): void {
        this._sessions.delete(sessionId);
        const { currentSession } = this;
        if (currentSession && currentSession.id === sessionId) {
            this.updateCurrentSession(undefined);
        }
    }

    getSession(sessionId: string): DebugSession | undefined {
        return this._sessions.get(sessionId);
    }

    get sessions(): DebugSession[] {
        return Array.from(this._sessions.values()).filter(session => session.state > DebugState.Inactive);
    }

    protected _currentSession: DebugSession | undefined;
    protected readonly toDisposeOnCurrentSession = new DisposableCollection();
    get currentSession(): DebugSession | undefined {
        return this._currentSession;
    }
    set currentSession(current: DebugSession | undefined) {
        if (this._currentSession === current) {
            return;
        }
        this.toDisposeOnCurrentSession.dispose();
        const previous = this.currentSession;
        this._currentSession = current;
        this.onDidChangeActiveDebugSessionEmitter.fire({ previous, current });
        if (current) {
            this.toDisposeOnCurrentSession.push(current.onDidChange(() => {
                if (this.currentFrame === this.topFrame) {
                    this.open();
                }
                this.fireDidChange(current);
            }));
        }
        this.updateBreakpoints(previous, current);
        this.open();
        this.fireDidChange(current);
    }
    open(): void {
        const { currentFrame } = this;
        if (currentFrame) {
            currentFrame.open();
        }
    }
    protected updateBreakpoints(previous: DebugSession | undefined, current: DebugSession | undefined): void {
        const affectedUri = new Set();
        for (const session of [previous, current]) {
            if (session) {
                for (const uriString of session.breakpointUris) {
                    if (!affectedUri.has(uriString)) {
                        affectedUri.add(uriString);
                        this.fireDidChangeBreakpoints({
                            session: current,
                            uri: new URI(uriString)
                        });
                    }
                }
            }
        }
    }
    protected updateCurrentSession(session: DebugSession | undefined) {
        this.currentSession = session || this.sessions[0];
    }

    get currentThread(): DebugThread | undefined {
        const session = this.currentSession;
        return session && session.currentThread;
    }

    get state(): DebugState {
        const session = this.currentSession;
        return session ? session.state : DebugState.Inactive;
    }

    get currentFrame(): DebugStackFrame | undefined {
        const { currentThread } = this;
        return currentThread && currentThread.currentFrame;
    }
    get topFrame(): DebugStackFrame | undefined {
        const { currentThread } = this;
        return currentThread && currentThread.topFrame;
    }

    /**
     * Destroy the debug session. If session identifier isn't provided then
     * all active debug session will be destroyed.
     * @param sessionId The session identifier
     */
    destroy(sessionId?: string): void {
        if (sessionId) {
            const session = this._sessions.get(sessionId);
            if (session) {
                this.doDestroy(session);
            }
        } else {
            this._sessions.forEach(session => this.doDestroy(session));
        }
    }

    private doDestroy(session: DebugSession): void {
        this.debug.terminateDebugSession(session.id);

        session.dispose();
        this.remove(session.id);
        this.onDidDestroyDebugSessionEmitter.fire(session);
    }

    getBreakpoints(session?: DebugSession): DebugBreakpoint[];
    getBreakpoints(uri: URI, session?: DebugSession): DebugBreakpoint[];
    getBreakpoints(arg?: URI | DebugSession, arg2?: DebugSession): DebugBreakpoint[] {
        const uri = arg instanceof URI ? arg : undefined;
        const session = arg instanceof DebugSession ? arg : arg2 instanceof DebugSession ? arg2 : this.currentSession;
        if (session && session.state > DebugState.Initializing) {
            return session.getBreakpoints(uri);
        }
        return this.breakpoints.findMarkers({ uri }).map(({ data }) => new DebugBreakpoint(data, this.labelProvider, this.breakpoints, this.editorManager));
    }
    getBreakpoint(uri: URI, line: number): DebugBreakpoint | undefined {
        const session = this.currentSession;
        if (session && session.state > DebugState.Initializing) {
            return session.getBreakpoints(uri).filter(breakpoint => breakpoint.line === line)[0];
        }
        const origin = this.breakpoints.getBreakpoint(uri, line);
        return origin && new DebugBreakpoint(origin, this.labelProvider, this.breakpoints, this.editorManager);
    }

    addBreakpoints(breakpoints: DebugBreakpoint[]): void {
        breakpoints.forEach(breakpoint => {
            this.breakpoints.addBreakpoint(breakpoint.uri, breakpoint.line, breakpoint.column);
            this.fireDidChangeBreakpoints({ uri: breakpoint.uri });
        });
    }

    deleteBreakpoints(breakpoints: DebugBreakpoint[]): void {
        breakpoints.forEach(breakpoint => {
            this.breakpoints.deleteBreakpoint(breakpoint.uri, breakpoint.line, breakpoint.column);
            this.fireDidChangeBreakpoints({ uri: breakpoint.uri });
        });
    }
}
