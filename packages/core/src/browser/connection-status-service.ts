/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, optional, postConstruct } from 'inversify';
import { ILogger } from '../common/logger';
import { Event, Emitter } from '../common/event';
import { DefaultFrontendApplicationContribution } from './frontend-application';
import { StatusBar, StatusBarAlignment } from './status-bar/status-bar';
import { WebSocketConnectionProvider } from './messaging/ws-connection-provider';
import { Disposable } from '../common';

/**
 * Service for listening on backend connection changes.
 */
export const ConnectionStatusService = Symbol('ConnectionStatusService');
export interface ConnectionStatusService {

    /**
     * The actual connection status.
     */
    readonly currentStatus: ConnectionStatus;

    /**
     * Clients can listen on connection status change events.
     */
    readonly onStatusChange: Event<ConnectionStatus>;

}

/**
 * The connection status.
 */
export enum ConnectionStatus {

    /**
     * Connected to the backend.
     */
    ONLINE,

    /**
     * The connection is lost between frontend and backend.
     */
    OFFLINE
}

@injectable()
export class ConnectionStatusOptions {

    static DEFAULT: ConnectionStatusOptions = {
        offlineTimeout: 5000,
    };

    /**
     * Timeout in milliseconds before the application is considered offline. Must be a positive integer.
     */
    readonly offlineTimeout: number;

}

export const PingService = Symbol('PingService');
export interface PingService {
    ping(): Promise<void>;
}

@injectable()
export abstract class AbstractConnectionStatusService implements ConnectionStatusService, Disposable {

    protected readonly statusChangeEmitter = new Emitter<ConnectionStatus>();

    protected connectionStatus: ConnectionStatus = ConnectionStatus.ONLINE;
    protected timer: number | undefined;

    @inject(ILogger)
    protected readonly logger: ILogger;

    constructor(@inject(ConnectionStatusOptions) @optional() protected readonly options: ConnectionStatusOptions = ConnectionStatusOptions.DEFAULT) { }

    get onStatusChange() {
        return this.statusChangeEmitter.event;
    }

    get currentStatus() {
        return this.connectionStatus;
    }

    dispose() {
        this.statusChangeEmitter.dispose();
        if (this.timer) {
            this.clearTimeout(this.timer);
        }
    }

    protected updateStatus(success: boolean): void {
        // clear existing timer
        if (this.timer) {
            this.clearTimeout(this.timer);
        }
        const previousStatus = this.connectionStatus;
        const newStatus = success ? ConnectionStatus.ONLINE : ConnectionStatus.OFFLINE;
        if (previousStatus !== newStatus) {
            this.connectionStatus = newStatus;
            this.fireStatusChange(newStatus);
        }
        // schedule offline
        this.timer = this.setTimeout(() => {
            this.logger.trace(`No activity for ${this.options.offlineTimeout} ms. We are offline.`);
            this.updateStatus(false);
        }, this.options.offlineTimeout);
    }

    protected fireStatusChange(status: ConnectionStatus) {
        this.statusChangeEmitter.fire(status);
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
export class FrontendConnectionStatusService extends AbstractConnectionStatusService {

    private scheduledPing: number | undefined;

    @inject(WebSocketConnectionProvider) protected readonly wsConnectionProvider: WebSocketConnectionProvider;
    @inject(PingService) protected readonly pingService: PingService;

    @postConstruct()
    protected init() {
        this.schedulePing();
        this.wsConnectionProvider.onIncomingMessageActivity(() => {
            // natural activity
            this.updateStatus(true);
            this.schedulePing();
        });
    }

    protected schedulePing() {
        if (this.scheduledPing) {
            this.clearTimeout(this.scheduledPing);
        }
        this.scheduledPing = this.setTimeout(async () => {
            try {
                await this.pingService.ping();
                this.updateStatus(true);
            } catch (e) {
                this.logger.trace(e);
            }
            this.schedulePing();
        }, this.options.offlineTimeout * 0.8);
    }
}

@injectable()
export class ApplicationConnectionStatusContribution extends DefaultFrontendApplicationContribution {

    constructor(
        @inject(ConnectionStatusService) protected readonly connectionStatusService: ConnectionStatusService,
        @inject(StatusBar) protected readonly statusBar: StatusBar,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        super();
        this.connectionStatusService.onStatusChange(state => this.onStateChange(state));
    }

    protected onStateChange(state: ConnectionStatus): void {
        switch (state) {
            case ConnectionStatus.OFFLINE: {
                this.handleOffline();
                break;
            }
            case ConnectionStatus.ONLINE: {
                this.handleOnline();
                break;
            }
        }
    }

    private statusbarId = 'connection-status';

    protected handleOnline() {
        this.statusBar.setBackgroundColor(undefined);
        this.statusBar.setColor(undefined);
        this.statusBar.removeElement(this.statusbarId);
    }

    protected handleOffline() {
        this.statusBar.setElement(this.statusbarId, {
            alignment: StatusBarAlignment.LEFT,
            text: 'Offline',
            tooltip: 'Cannot connect to backend.',
            priority: 5000
        });
        this.statusBar.setBackgroundColor('var(--theia-warn-color0)');
        this.statusBar.setColor('var(--theia-warn-font-color0)');
    }
}
