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
import { DebugSessionPath } from "../common/debug-model";
import { DebugProtocol } from "vscode-debugprotocol";
import { Disposable } from "vscode-jsonrpc";
import { Deferred } from "@theia/core/lib/common/promise-util";

export interface DebugClient extends Disposable {
    sessionId: string;

    connect(): Promise<void>;
    sendRequest(command: string, args?: any): Promise<DebugProtocol.Response>;
}

export class BaseDebugClient implements DebugClient {
    protected sequence = 1;
    protected pendingRequests = new Map<number, Deferred<DebugProtocol.Response>>();
    protected websocket: Promise<WebSocket>;

    constructor(
        public readonly sessionId: string,
        protected readonly connectionProvider: WebSocketConnectionProvider) {
    }

    connect(): Promise<void> {
        this.websocket = this.initWebSocket();
        return this.websocket.then(() => { });
    }

    sendRequest(command: string, args?: any): Promise<DebugProtocol.Response> {
        const response = new Deferred<DebugProtocol.Response>();

        const request: DebugProtocol.Request = {
            seq: this.sequence++,
            type: "request",
            command: command,
            arguments: args
        };

        this.websocket
            .then(websocket => {
                this.pendingRequests.set(request.seq, response);
                websocket.send(JSON.stringify(request));
            }).catch(error => {
                console.error(error);
            });

        return response.promise;
    }

    dispose() {
        this.websocket
            .then(websocket => websocket.close)
            .catch(error => console.error(error));
    }

    private initWebSocket(): Promise<WebSocket> {
        const url = this.connectionProvider.createWebSocketUrl(DebugSessionPath + "/" + this.sessionId);
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
        const response: DebugProtocol.ProtocolMessage = JSON.parse(event.data);
        if (response.type === 'response') {
            const pendingRequest = this.pendingRequests.get(response.seq);
            if (pendingRequest) {
                pendingRequest.resolve(<DebugProtocol.Response>response);
            }
        }
    }
}

@injectable()
export class DebugClientFactory {
    constructor(
        @inject(WebSocketConnectionProvider)
        protected readonly connectionProvider: WebSocketConnectionProvider
    ) { }

    get(sessionId: string): Promise<DebugClient> {
        const debugClient = new BaseDebugClient(sessionId, this.connectionProvider);
        return debugClient.connect().then(() => debugClient);
    }
}

/**
 * It is intended to manage active debug sessions. Let's assume that user might
 * instantiate several debug sessions and switch between them.
 */
@injectable()
export class DebugClientManager {
    private activeSessionId: string | undefined;
    protected readonly clients = new Map<string, DebugClient>();

    constructor(
        @inject(DebugClientFactory)
        protected readonly debugClientFactory: DebugClientFactory
    ) { }

    /**
     * Creates a new [debug client](#DebugClient).
     * @param sessionId The session identifier
     * @returns The debug client
     */
    create(sessionId: string): Promise<DebugClient> {
        const client = this.debugClientFactory.get(sessionId);
        client.then(client => this.clients.set(sessionId, client));
        return client;
    }

    /**
     * Disposes the [debug client](#DebugClient).
     * @param sessionId The session identifier
     */
    dispose(sessionId: string): void {
        const debugClient = this.clients.get(sessionId);

        if (debugClient) {
            debugClient.dispose();
            this.clients.delete(sessionId);

            if (this.activeSessionId === sessionId) {
                if (this.clients.size !== 0) {
                    this.setActiveDebugClient(this.clients.values().next().value);
                } else {
                    this.setActiveDebugClient(undefined);
                }
            }
        }
    }

    /**
     * Finds all instantiated debug clients.
     * @returns An array of debug sessions identifiers
     */
    findAll(): string[] {
        return Array.from(this.clients.keys());
    }

    /**
     * Sets the active debug client.
     * @param debugClient the [debug client](#DebugClient)
     */
    setActiveDebugClient(debugClient: DebugClient | undefined) {
        if (debugClient) {
            this.activeSessionId = debugClient.sessionId;
        } else {
            this.activeSessionId = undefined;
        }
    }

    /**
     * Returns the active debug client.
     * @returns the [debug client](#DebugClient)
     */
    getActiveDebugClient(): DebugClient | undefined {
        if (this.activeSessionId) {
            return this.clients.get(this.activeSessionId);
        }
    }
}
