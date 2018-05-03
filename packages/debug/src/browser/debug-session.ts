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
import { Emitter, Event } from "@theia/core";
import * as ee from 'events';

export interface DebugSession extends Disposable {
    sessionId: string;
    configuration: DebugConfiguration;

    connect(): Promise<void>;
    sendRequest(command: string, args?: any): Promise<void>;
}

export class DebugSessionImpl extends ee.EventEmitter implements DebugSession {
    protected websocket: Promise<WebSocket>;

    constructor(
        public readonly sessionId: string,
        public readonly configuration: DebugConfiguration,
        protected readonly connectionProvider: WebSocketConnectionProvider) {
        super();
    }

    connect(): Promise<void> {
        this.websocket = this.initWebSocket();
        return this.websocket.then(() => { });
    }

    sendRequest(command: string, args?: any): Promise<void> {
        const request = {
            type: "request",
            command: command,
            arguments: args
        };

        return this.websocket
            .then(websocket => websocket.send(JSON.stringify(request)))
            .catch(error => console.log(error && error.message));
    }

    dispose() {
        this.websocket
            .then(websocket => websocket.close)
            .catch(error => console.error(error));
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

    private handleMessage(event: MessageEvent) {
        const message: DebugProtocol.ProtocolMessage = JSON.parse(event.data);
        if (message.type === 'response') {
            // TODO
        } else if (message.type === 'event') {
            // TODO
        }
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

    protected readonly clients = new Map<string, DebugSession>();
    protected readonly onDidChangeActiveDebugSessionEmitter = new Emitter<DebugSession | undefined>();
    protected readonly onDidStartDebugSessionEmitter = new Emitter<DebugSession>();
    protected readonly onDidTerminateDebugSessionEmitter = new Emitter<DebugSession>();

    constructor(
        @inject(DebugSessionFactory)
        protected readonly debugClientFactory: DebugSessionFactory
    ) { }

    /**
     * Creates a new [debug client](#DebugClient).
     * @param sessionId The session identifier
     * @param configuration The debug configuration
     * @returns The debug client
     */
    create(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        const client = this.debugClientFactory.get(sessionId, debugConfiguration);
        this.clients.set(sessionId, client);
        this.onDidStartDebugSessionEmitter.fire(client);
        return client;
    }

    /**
     * Removes the [debug client](#DebugClient).
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void {
        this.clients.delete(sessionId);
        if (this.activeDebugSessionId) {
            if (this.activeDebugSessionId === sessionId) {
                if (this.clients.size !== 0) {
                    this.setActiveDebugSession(this.clients.keys().next().value);
                } else {
                    this.setActiveDebugSession(undefined);
                }

            }
        }
    }

    /**
     * Finds all instantiated debug clients.
     * @returns An array of debug clients
     */
    findAll(): DebugSession[] {
        return Array.from(this.clients.values());
    }

    /**
     * Sets the active debug client.
     * @param sessionId The session identifier
     */
    setActiveDebugSession(sessionId: string | undefined) {
        if (this.activeDebugSessionId !== sessionId) {
            this.activeDebugSessionId = sessionId;
            this.onDidChangeActiveDebugSessionEmitter.fire(this.getActiveDebugSession());
        }
    }

    /**
     * Returns the active debug client.
     * @returns the [debug client](#DebugClient)
     */
    getActiveDebugSession(): DebugSession | undefined {
        if (this.activeDebugSessionId) {
            return this.clients.get(this.activeDebugSessionId);
        }
    }

    /**
     * Disposes the debug client.
     * @param sessionId The session identifier
     */
    dispose(sessionId?: string): void {
        if (sessionId) {
            const debugClient = this.clients.get(sessionId);
            if (debugClient) {
                this.doDispose(debugClient);
            }
        } else {
            this.clients.forEach(debugClient => this.doDispose(debugClient));
        }
    }

    private doDispose(debugClient: DebugSession): void {
        debugClient.dispose();
        this.remove(debugClient.sessionId);
        this.onDidTerminateDebugSessionEmitter.fire(debugClient);
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
