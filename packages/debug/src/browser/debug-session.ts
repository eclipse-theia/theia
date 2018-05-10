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

import { injectable, inject } from "inversify";
import { WebSocketConnectionProvider } from "@theia/core/lib/browser";
import { DebugAdapterPath, DebugConfiguration } from "../common/debug-model";
import { DebugProtocol } from "vscode-debugprotocol";
import { Disposable } from "vscode-jsonrpc";
import { Deferred } from "@theia/core/lib/common/promise-util";
import { Emitter, Event, DisposableCollection } from "@theia/core";

export interface DebugSession extends Disposable {
    sessionId: string;
    configuration: DebugConfiguration;

    getServerCapabilities(): DebugProtocol.Capabilities | undefined;
    initialize(): Promise<DebugProtocol.InitializeResponse>;
    configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse>;
    threads(): Promise<DebugProtocol.ThreadsResponse>;
    stacks(args: DebugProtocol.StackTraceArguments): Promise<DebugProtocol.StackTraceResponse>;
    disconnect(): Promise<DebugProtocol.InitializeResponse>;
}

export class DebugSessionImpl implements DebugSession {
    private sequence: number;

    protected readonly toDispose = new DisposableCollection();
    protected readonly callbacks = new Map<number, (response: any) => void>();

    protected websocket: Promise<WebSocket>;
    protected capabilities: DebugProtocol.Capabilities = {};

    constructor(
        public readonly sessionId: string,
        public readonly configuration: DebugConfiguration,
        protected readonly connectionProvider: WebSocketConnectionProvider) {

        this.websocket = this.initWebSocket();
        this.sequence = 1;
    }

    private initWebSocket(): Promise<WebSocket> {
        const url = this.connectionProvider.createWebSocketUrl(DebugAdapterPath + "/" + this.sessionId);
        const websocket = this.connectionProvider.createWebSocket(url, { reconnecting: false });

        const initialized = new Deferred<WebSocket>();

        websocket.onopen = () => {
            initialized.resolve(websocket);
        };
        websocket.onerror = () => {
            initialized.reject(`Failed to establish connection with debug adapter by url: '${url}'`);
        };
        websocket.onmessage = (event: MessageEvent): void => {
            this.handleMessage(event);
        };

        return initialized.promise;
    }

    initialize(): Promise<DebugProtocol.InitializeResponse> {
        return this.proceedRequest("initialize", {
            clientID: "Theia",
            clientName: "Theia",
            adapterID: this.configuration.type,
            locale: "",
            linesStartAt1: true,
            columnsStartAt1: true,
            pathFormat: "path",
            supportsVariableType: false,
            supportsVariablePaging: false,
            supportsRunInTerminalRequest: false
        }).then((response: DebugProtocol.InitializeResponse) => {
            this.capabilities = response.body || {};
            return response;
        });
    }

    threads(): Promise<DebugProtocol.ThreadsResponse> {
        return this.proceedRequest("threads");
    }

    stacks(args: DebugProtocol.StackTraceArguments): Promise<DebugProtocol.StackTraceResponse> {
        return this.proceedRequest("stackTrace", args);
    }

    configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse> {
        return this.proceedRequest("configurationDone");
    }

    getServerCapabilities(): DebugProtocol.Capabilities {
        return this.capabilities;
    }

    disconnect(): Promise<DebugProtocol.DisconnectResponse> {
        return this.proceedRequest("disconnect", { terminateDebuggee: true });
    }

    protected handleMessage(event: MessageEvent) {
        const message: DebugProtocol.ProtocolMessage = JSON.parse(event.data);
        if (message.type === 'response') {
            this.proceedResponse(message as DebugProtocol.Response);
        } else if (message.type === 'event') {
            this.proceedEvent(message as DebugProtocol.Event);
        }
    }

    protected proceedRequest<T>(command: string, args?: any): Promise<T> {
        const result = new Deferred<T>();

        const request: DebugProtocol.Request = {
            seq: this.sequence++,
            type: "request",
            command: command,
            arguments: args
        };

        this.callbacks.set(request.seq, (response: T) => {
            result.resolve(response);
        });

        return this.websocket
            .then(websocket => websocket.send(JSON.stringify(request)))
            .then(() => result.promise);
    }

    protected proceedResponse(response: DebugProtocol.Response): void {
        console.log(response);

        const callback = this.callbacks.get(response.request_seq);
        if (callback) {
            this.callbacks.delete(response.request_seq);
            callback(response);
        }
    }

    protected proceedEvent(event: DebugProtocol.Event): void {
        console.log(event);
    }

    dispose() {
        this.callbacks.clear();
        this.websocket
            .then(websocket => websocket.close())
            .catch(error => console.error(error));
    }
}

@injectable()
export class DebugSessionFactory {
    constructor(
        @inject(WebSocketConnectionProvider)
        protected readonly connectionProvider: WebSocketConnectionProvider
    ) { }

    get(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        return new DebugSessionImpl(sessionId, debugConfiguration, this.connectionProvider);
    }
}

/** It is intended to manage active debug sessions. */
@injectable()
export class DebugSessionManager implements Disposable {
    private activeDebugSessionId: string | undefined;

    protected readonly sessions = new Map<string, DebugSession>();
    protected readonly onDidChangeActiveDebugSessionEmitter = new Emitter<DebugSession | undefined>();
    protected readonly onDidStartDebugSessionEmitter = new Emitter<DebugSession>();
    protected readonly onDidTerminateDebugSessionEmitter = new Emitter<DebugSession>();

    constructor(
        @inject(DebugSessionFactory)
        protected readonly debugSessionFactory: DebugSessionFactory
    ) { }

    /**
     * Creates a new [debug session](#DebugSession).
     * @param sessionId The session identifier
     * @param configuration The debug configuration
     * @returns The debug session
     */
    create(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        const session = this.debugSessionFactory.get(sessionId, debugConfiguration);
        this.sessions.set(sessionId, session);
        this.onDidStartDebugSessionEmitter.fire(session);
        return session;
    }

    /**
     * Removes the [debug session](#DebugSession).
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
        if (this.activeDebugSessionId) {
            if (this.activeDebugSessionId === sessionId) {
                if (this.sessions.size !== 0) {
                    this.setActiveDebugSession(this.sessions.keys().next().value);
                } else {
                    this.setActiveDebugSession(undefined);
                }

            }
        }
    }

    /**
     * Finds all instantiated debug sessions.
     * @returns An array of debug sessions
     */
    findAll(): DebugSession[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Sets the active debug session.
     * @param sessionId The session identifier
     */
    setActiveDebugSession(sessionId: string | undefined) {
        if (this.activeDebugSessionId !== sessionId) {
            this.activeDebugSessionId = sessionId;
            this.onDidChangeActiveDebugSessionEmitter.fire(this.getActiveDebugSession());
        }
    }

    /**
     * Returns the active debug session.
     * @returns the [debug session](#DebugSession)
     */
    getActiveDebugSession(): DebugSession | undefined {
        if (this.activeDebugSessionId) {
            return this.sessions.get(this.activeDebugSessionId);
        }
    }

    /**
     * Disposes the debug session.
     * @param sessionId The session identifier
     */
    dispose(sessionId?: string): void {
        if (sessionId) {
            const session = this.sessions.get(sessionId);
            if (session) {
                this.doDispose(session);
            }
        } else {
            this.sessions.forEach(session => this.doDispose(session));
        }
    }

    private doDispose(session: DebugSession): void {
        session.dispose();
        this.remove(session.sessionId);
        this.onDidTerminateDebugSessionEmitter.fire(session);
    }

    get onDidChangeActiveDebugSession(): Event<DebugSession | undefined> {
        return this.onDidChangeActiveDebugSessionEmitter.event;
    }

    get onDidStartDebugSession(): Event<DebugSession> {
        return this.onDidStartDebugSessionEmitter.event;
    }

    get onDidTerminateDebugSession(): Event<DebugSession> {
        return this.onDidTerminateDebugSessionEmitter.event;
    }
}
