/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { injectable } from 'inversify';
import { Connection } from '../../common/messaging/connection';
import { ConnectionId, CONNECTION_ID_KEY, HTTP_LONG_POLLING_PATH } from '../../common/messaging/http-long-polling-protocol';
import { Endpoint } from '../endpoint';
import { ConnectionProvider } from './connection-provider';

@injectable()
export class HttpLongPollingConnectionProvider implements ConnectionProvider {

    async connect(serviceId: string, options: object = {}): Promise<Connection> {
        const url = this.getHttpLongPollingEndpoint().getRestUrl().toString(true);
        return new HttpLongPollingConnection(url);
    }

    protected getHttpLongPollingEndpoint(): Endpoint {
        return new Endpoint({ path: HTTP_LONG_POLLING_PATH });
    }
}

export class HttpLongPollingConnection extends Connection.AbstractBase {

    state = Connection.State.Opening;

    /**
     * Undefined until the server responds to our `open` request with our `ConnectionId`.
     */
    protected connectionId?: ConnectionId;
    /**
     * This queue allows us to read messages asynchronously in the right order.
     */
    protected decodingQueue: Promise<void> = Promise.resolve();
    /**
     * Make sure messages are POSTed in order.
     */
    protected sendQueue: Promise<void> = Promise.resolve();

    protected pendingMessages: string[];
    protected sendTimeout?: number;

    constructor(
        protected url: string,
    ) {
        super();
        this.open()
            .then(() => this.pollingTask())
            .catch(error => this.handleError(error));
    }

    sendMessage(message: string): void {
        Connection.ensureOpened(this);
        this.pendingMessages.push(message);
        this.scheduleSend();
    }

    close(event: Connection.CloseEvent): void {
        Connection.ensureNotClosing(this);
        Connection.ensureNotClosed(this);
        event = Connection.normalizeCloseEvent(event);
        this.state = Connection.State.Closed;
        this.onCloseEmitter.fire(event);
        this.sendCloseEvent(event);
    }

    protected async open(): Promise<void> {
        const response = await fetch(`${this.url}/open`, { method: 'GET' });
        if (response.status !== 200) {
            throw new Error('HTTP polling connection refused');
        }
        const connectionId = response.headers.get(CONNECTION_ID_KEY);
        if (!connectionId) {
            throw new Error('no connection id');
        }
        this.connectionId = connectionId;
        this.state = Connection.State.Open;
        this.onOpenEmitter.fire(this);
    }

    protected async pollingTask(): Promise<void> {
        let onClose: (() => void) | undefined;
        const onCloseHandle = this.onClose(() => onClose?.());
        try {
            while (this.state !== Connection.State.Closing && this.state !== Connection.State.Closed) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 60_000);
                onClose = () => controller.abort();
                // Do a GET request that's our long polling. We expect to receive
                // JSON that represents a list of messages.
                let response: Response | undefined;
                try {
                    response = await fetch(this.url, {
                        signal: controller.signal,
                        method: 'GET',
                        headers: {
                            [CONNECTION_ID_KEY]: this.connectionId!,
                            'accept': 'application/json'
                        }
                    });
                } catch (error) {
                    if (controller.signal.aborted && error instanceof DOMException && error.name === 'AbortError') {
                        // We self-aborted the request via a timeout; let's see if we can retry:
                        continue;
                    }
                    // Non-recoverable error
                    throw error;
                } finally {
                    clearTimeout(timeout);
                    onClose = undefined;
                }
                // Process the response
                if (response.status === 200) {
                    // 200 means we received messages
                    this.decodingQueue = this.handle200(response);
                } else if (response.status === 410) {
                    // 410 means connection got closed by the remote
                    this.state = Connection.State.Closing;
                    this.decodingQueue = this.handle410(response);
                    break; // exit receive loop
                } else {
                    throw new Error(`wrong "poll" request status: ${response.status}: ${response.statusText}`);
                }
            }
        } finally {
            onCloseHandle.dispose();
        }
    }

    protected async handle200(response: Response): Promise<void> {
        // Start reading JSON asynchronously
        const jsonDecoding = response.json();
        await this.decodingQueue;
        const data = await jsonDecoding as unknown;
        if (!Array.isArray(data)) {
            throw new Error('response should be an array');
        }
        for (const message of data as unknown[]) {
            if (typeof message === 'string') {
                this.onMessageEmitter.fire(message);
            }
        }
    }

    protected async handle410(response: Response): Promise<void> {
        // Start reading JSON asynchronously
        const jsonDecoding = response.json();
        await this.decodingQueue;
        const data = await jsonDecoding;
        // eslint-disable-next-line no-null/no-null
        if (typeof data === 'object' && data !== null && typeof data.code === 'number' && (typeof data.reason === 'undefined' || typeof data.reason === 'string')) {
            this.closeLocally({ code: data.code, reason: data.reason });
        } else {
            this.closeLocally({ code: -1, reason: 'wrong message format' });
        }
    }

    protected async handleError(error: Error): Promise<void> {
        this.state = Connection.State.Closing;
        const reason = String(error);
        this.onErrorEmitter.fire(reason);
        this.closeLocally({
            code: -1,
            reason
        });
    }

    protected scheduleSend(): void {
        if (!this.sendTimeout) {
            this.sendTimeout = setTimeout(() => this.sendPendingMessages());
        }
    }

    protected sendPendingMessages(): void {
        const body: string = JSON.stringify(this.pendingMessages);
        this.sendQueue = this.sendQueue.then(async () => {
            const response = await fetch(`${this.url}/post`, {
                method: 'POST',
                headers: {
                    [CONNECTION_ID_KEY]: this.connectionId!,
                    'content-type': 'application/json'
                },
                body,
            });
            if (response.status !== 200) {
                const error = new Error(response.statusText);
                this.handleError(error);
                throw error; // crash the `sendQueue`
            }
        });
        this.pendingMessages = [];
    }

    protected closeLocally(event: Connection.CloseEvent): void {
        Connection.ensureNotClosing(this);
        Connection.ensureNotClosed(this);
        event = Connection.normalizeCloseEvent(event);
        this.state = Connection.State.Closed;
        this.onCloseEmitter.fire(event);
    }

    protected async sendCloseEvent(event: Connection.CloseEvent): Promise<void> {
        event = Connection.normalizeCloseEvent(event);
        const params: Record<string, string> = {
            connectionId: this.connectionId!,
            code: event.code.toString()
        };
        if (typeof event.reason === 'string') {
            params.reason = event.reason;
        }
        // `sendBeacon` sends a POST request
        if (!navigator.sendBeacon(`${this.url}/close`, new URLSearchParams(params))) {
            console.debug('unable to send "close" request');
        }
    }
}
