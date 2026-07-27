// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Disposable, MaybePromise } from '@theia/core';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { ILogger } from '@theia/core/lib/common/logger';
import * as express from '@theia/core/shared/express';
import { inject, injectable, named } from '@theia/core/shared/inversify';

export const ExternalApiEventStreamOptions = Symbol('ExternalApiEventStreamOptions');
/**
 * Instantiation options of an {@link ExternalApiEventStream}.
 */
export interface ExternalApiEventStreamOptions<T = unknown> {
    /** Name under which the events are sent, i.e. the `event:` field of each server-sent event. */
    event: string;
    /**
     * Provides the data snapshot that is sent to each connecting client and broadcast —
     * coalesced — on {@link ExternalApiEventStream.notifyChanged}.
     */
    snapshot?: () => MaybePromise<T>;
    /** Delay in milliseconds by which {@link ExternalApiEventStream.notifyChanged} broadcasts are coalesced. Defaults to 100. */
    coalesceDelay?: number;
    /** Interval in milliseconds of the keep-alive comments sent to connected clients. Defaults to 30000. */
    heartbeatInterval?: number;
    /** Stable operation id of the stream's route, unique across the external API, published in the OpenAPI document. */
    operationId?: string;
    /** Short summary of the stream, published in the OpenAPI document. */
    summary?: string;
    /** Longer description of the stream, published in the OpenAPI document; CommonMark. */
    description?: string;
    /** JSON Schema of the event payloads, published in the OpenAPI document. */
    dataSchema?: IJSONSchema;
}

export const ExternalApiEventStreamFactory = Symbol('ExternalApiEventStreamFactory');
/** Creates {@link ExternalApiEventStream}s, see `ExternalApiRouter#eventStream`. */
export type ExternalApiEventStreamFactory = <T>(options: ExternalApiEventStreamOptions<T>) => ExternalApiEventStream<T>;

export const ExternalApiEventStream = Symbol('ExternalApiEventStream');
/**
 * Serves data as server-sent events to the clients of an external API endpoint.
 *
 * The stream manages the connected clients, sends periodic keep-alive comments, delivers the
 * configured snapshot to connecting clients, and broadcasts — coalescing bursts — a fresh
 * snapshot when {@link notifyChanged} is called. Disposing the stream ends all client
 * connections; streams created through `ExternalApiRouter#eventStream` are disposed
 * automatically when the routing is rebuilt, so that clients reconnect against the new
 * configuration.
 */
export interface ExternalApiEventStream<T = unknown> extends Disposable {

    /** The number of currently connected clients. */
    readonly clientCount: number;

    /** Serves the event stream to a client; registered as the route's request handler by `ExternalApiRouter#eventStream`. */
    handle(request: express.Request, response: express.Response): Promise<void>;

    /**
     * Schedules a coalesced broadcast of a fresh snapshot to all connected clients.
     * No-op without a configured snapshot provider or without connected clients.
     */
    notifyChanged(): void;

    /** Sends the data to all connected clients immediately, bypassing the coalescing. */
    send(data: T): void;
}

/**
 * Default implementation of the {@link ExternalApiEventStream}.
 */
@injectable()
export class ExternalApiEventStreamImpl<T = unknown> implements ExternalApiEventStream<T> {

    @inject(ILogger) @named('external-api:ExternalApiEventStream')
    protected readonly logger: ILogger;

    @inject(ExternalApiEventStreamOptions)
    protected readonly options: ExternalApiEventStreamOptions<T>;

    /** Open server-sent event streams, one per connected client. */
    protected readonly clients = new Set<express.Response>();
    protected heartbeatTimer?: NodeJS.Timeout;
    protected broadcastTimer?: NodeJS.Timeout;
    protected disposed = false;

    get clientCount(): number {
        return this.clients.size;
    }

    async handle(request: express.Request, response: express.Response): Promise<void> {
        if (this.disposed) {
            response.status(503).end();
            return;
        }
        response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        // open the stream on the client even when no data is sent until the first broadcast
        response.flushHeaders();
        this.clients.add(response);
        if (!this.heartbeatTimer) {
            this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatInterval);
        }
        // swallow write errors of streams whose client vanished; 'close' removes them right after
        response.on('error', error => this.logger.debug('An event stream client connection failed.', error));
        response.on('close', () => {
            this.clients.delete(response);
            if (this.clients.size === 0) {
                this.stopTimers();
            }
        });
        await this.sendSnapshot(response);
    }

    notifyChanged(): void {
        const snapshot = this.options.snapshot;
        if (!snapshot || this.clients.size === 0 || this.broadcastTimer) {
            return;
        }
        this.broadcastTimer = setTimeout(async () => {
            this.broadcastTimer = undefined;
            try {
                this.send(await snapshot());
            } catch (error) {
                this.logger.warn('Failed to broadcast a snapshot to the event stream clients.', error);
            }
        }, this.coalesceDelay);
    }

    send(data: T): void {
        for (const client of this.clients) {
            this.write(client, data);
        }
    }

    /** Ends all client connections and stops the timers. */
    dispose(): void {
        this.disposed = true;
        this.stopTimers();
        const clients = Array.from(this.clients);
        this.clients.clear();
        for (const client of clients) {
            client.end();
        }
    }

    protected async sendSnapshot(client: express.Response): Promise<void> {
        if (!this.options.snapshot) {
            return;
        }
        try {
            this.write(client, await this.options.snapshot());
        } catch (error) {
            this.logger.error('Failed to send the initial snapshot to an event stream client.', error);
            client.end();
        }
    }

    protected write(client: express.Response, data: T): void {
        if (!client.destroyed) {
            client.write(`event: ${this.options.event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    }

    protected sendHeartbeat(): void {
        for (const client of this.clients) {
            if (!client.destroyed) {
                client.write(': keep-alive\n\n');
            }
        }
    }

    protected get coalesceDelay(): number {
        return this.options.coalesceDelay ?? 100;
    }

    protected get heartbeatInterval(): number {
        return this.options.heartbeatInterval ?? 30000;
    }

    protected stopTimers(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.broadcastTimer) {
            clearTimeout(this.broadcastTimer);
            this.broadcastTimer = undefined;
        }
    }
}
