/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, optional } from 'inversify';
import { ILogger } from '../common/logger';
import { Endpoint } from './endpoint';
import { Event, Emitter } from '../common/event';
import { AbstractDialog, DialogProps } from './dialogs';
import { FrontendApplicationContribution, DefaultFrontendApplicationContribution } from './frontend-application';

/**
 * Service for listening on backend connection changes.
 */
export const ConnectionStatusService = Symbol('ConnectionStatusService');
export interface ConnectionStatusService {

    /**
     * The actual connection state.
     */
    readonly currentState: ConnectionStatus;

    /**
     * Clients can listen on connection status change events.
     */
    readonly onStatusChange: Event<ConnectionStatus>;

}

/**
 * Connection status change event.
 */
export interface ConnectionStatus {

    /**
     * The current state of the connection.
     */
    readonly state: ConnectionState;

}

/**
 * The connection-status states.
 */
export enum ConnectionState {

    /**
     * Connected to the backend.
     */
    ONLINE,

    /**
     * The connection is lost between the client and the endpoint.
     */
    OFFLINE

}

@injectable()
export class ConnectionStatusOptions {

    static DEFAULT: ConnectionStatusOptions = {
        retry: 5,
        retryInterval: 1000,
        requestTimeout: 1000,
        maxRetryInterval: 10000
    };

    /**
     * Number of accepted timeouts. Must be a positive integer.
     */
    readonly retry: number;

    /**
     * Retry interval in milliseconds. Must be a positive integer.
     */
    readonly retryInterval: number;

    /**
     * The maximum retry interval in milliseconds. Should be a positive integer.
     *
     * If the request is timing out because of the slow Internet connection or the server is overloaded, we increase the `retryInterval` until it reaches this `maxRetryInterval`.
     */
    readonly maxRetryInterval: number;

    /**
     * Timeout for the HTTP GET request in milliseconds. Must be a positive integer.
     */
    readonly requestTimeout: number;

}

@injectable()
export class FrontendConnectionStatusService implements ConnectionStatusService, FrontendApplicationContribution {

    protected readonly statusChangeEmitter: Emitter<ConnectionStatus>;
    protected readonly endpointUrl: string;

    protected connectionState: ConnectionStatusImpl;
    protected timer: number | undefined;
    protected retryInterval: number;

    constructor(
        @inject(ConnectionStatusOptions) @optional() protected readonly options: ConnectionStatusOptions = ConnectionStatusOptions.DEFAULT,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.statusChangeEmitter = new Emitter<ConnectionStatus>();
        this.retryInterval = this.options.retryInterval;
        this.connectionState = new ConnectionStatusImpl({ threshold: this.options.retry });
        this.endpointUrl = new Endpoint().getRestUrl().toString();
    }

    onStart() {
        this.start();
    }

    onStop() {
        this.stop();
    }

    start() {
        if (this.timer === undefined) {
            this.schedule(this.checkAlive.bind(this));
            this.logger.debug('Started checking the backend connection status.');
            this.fireStatusChange(this.connectionState);
        }
    }

    stop() {
        if (this.timer !== undefined) {
            this.clearTimeout(this.timer);
            this.timer = undefined;
            this.logger.debug('Stopped checking the backend connection status.');
        }
    }

    get onStatusChange() {
        return this.statusChangeEmitter.event;
    }

    get currentState() {
        return this.connectionState;
    }

    protected schedule(checkAlive: () => Promise<boolean>) {
        const tick = async () => {
            this.logger.debug(`Checking backend connection status. Scheduled an alive request with ${this.retryInterval} ms timeout.`);
            const success = await checkAlive();
            this.logger.debug(success ? `Connected to the backend.` : `Cannot reach the backend.`);
            const previousState = this.connectionState;
            const newState = this.updateStatus(success);
            if (previousState.state !== newState.state) {
                this.fireStatusChange(newState);
            }
            // Increase the retry interval in a linear scale.
            this.retryInterval = success ? this.options.retryInterval : Math.min(this.retryInterval + this.options.retryInterval, this.options.maxRetryInterval);
            this.timer = this.setTimeout(tick, this.retryInterval);
        };
        this.timer = this.setTimeout(tick, this.retryInterval);
    }

    protected updateStatus(success: boolean): ConnectionStatusImpl {
        this.connectionState = this.connectionState.next(success);
        return this.connectionState;
    }

    protected fireStatusChange(event: ConnectionStatus) {
        this.statusChangeEmitter.fire(event);
    }

    protected checkAlive(): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const handle = (success: boolean) => resolve(success);
            const xhr = new XMLHttpRequest();
            xhr.timeout = this.options.requestTimeout;
            xhr.onreadystatechange = () => {
                const { readyState, status } = xhr;
                if (readyState === XMLHttpRequest.DONE) {
                    handle(status === 200);
                }
            };
            xhr.onerror = () => handle(false);
            xhr.ontimeout = () => handle(false);
            xhr.open('GET', `${this.endpointUrl}/alive`);
            try {
                xhr.send();
            } catch {
                handle(false);
            }
        });
    }

    // tslint:disable-next-line:no-any
    protected setTimeout(handler: (...args: any[]) => void, timeout: number): number {
        return window.setTimeout(handler, timeout);
    }

    protected clearTimeout(handle: number): void {
        window.clearTimeout(handle);
    }

}

@injectable()
export class ApplicationConnectionStatusContribution extends DefaultFrontendApplicationContribution {

    private dialog: ConnectionStatusDialog | undefined;

    constructor(
        @inject(ConnectionStatusService) protected readonly connectionStatusService: ConnectionStatusService,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        super();
        this.connectionStatusService.onStatusChange(status => this.onStatusChange(status));
    }

    protected onStatusChange(status: ConnectionStatus): void {
        switch (status.state) {
            case ConnectionState.OFFLINE: {
                this.handleOffline();
                break;
            }
            case ConnectionState.ONLINE: {
                this.handleOnline();
                break;
            }
        }
    }

    protected getOrCreateDialog(content: string): ConnectionStatusDialog {
        if (this.dialog === undefined) {
            this.dialog = new ConnectionStatusDialog({
                title: 'Not connected',
                content
            });
        }
        return this.dialog;
    }

    protected handleOnline() {
        const message = 'Successfully reconnected to the backend.';
        this.logger.info(message);
        if (this.dialog !== undefined) {
            this.dialog.dispose();
            this.dialog = undefined;
        }
    }

    protected handleOffline() {
        if (this.dialog === undefined) {
            const message = 'The application connection to the backend is lost. Attempting to reconnect...';
            this.logger.error(message);
            this.getOrCreateDialog(message).open();
        }
    }

}

export class ConnectionStatusImpl implements ConnectionStatus {

    private static readonly MAX_HISTORY = 100;

    constructor(
        protected readonly props: { readonly threshold: number },
        public readonly state: ConnectionState = ConnectionState.ONLINE,
        protected readonly history: boolean[] = []) {
    }

    next(success: boolean): ConnectionStatusImpl {
        const newHistory = this.updateHistory(success);
        // Initial optimism.
        let online = true;
        if (newHistory.length > this.props.threshold) {
            online = newHistory.slice(-this.props.threshold).some(s => s);
        }
        // Ideally, we do not switch back to online if we see any `true` items but, let's say, after three consecutive `true`s.
        return new ConnectionStatusImpl(this.props, online ? ConnectionState.ONLINE : ConnectionState.OFFLINE, newHistory);
    }

    protected updateHistory(success: boolean) {
        const updated = [...this.history, success];
        if (updated.length > ConnectionStatusImpl.MAX_HISTORY) {
            updated.shift();
        }
        return updated;
    }

}

export class ConnectionStatusDialog extends AbstractDialog<void> {

    public readonly value: void;

    constructor(dialogProps: DialogProps & { content: string }) {
        super(dialogProps);
        // Just to remove the X, so that the dialog cannot be closed by the user.
        this.closeCrossNode.remove();
        this.contentNode.appendChild(document.createTextNode(dialogProps.content));
    }

    protected onAfterAttach() {
        // NOOP.
        // We need disable the key listener for escape and return so that the dialog cannot be closed by the user.
    }

}
