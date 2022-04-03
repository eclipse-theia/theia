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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, optional, postConstruct } from 'inversify';
import { ILogger } from '../common/logger';
import { Event, Emitter } from '../common/event';
import { StatusBar, StatusBarAlignment } from './status-bar/status-bar';
import { Disposable, DisposableCollection, serviceIdentifier } from '../common';

/**
 * Service for listening on backend connection changes.
 */
export const ConnectionStatusService = serviceIdentifier<ConnectionStatusService>('ConnectionStatusService');
export interface ConnectionStatusService {

    /**
     * The actual connection status.
     */
    readonly currentStatus: ConnectionStatus;

    /**
     * Clients can listen on connection status change events.
     */
    onStatusChange: Event<ConnectionStatus>;
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
        pingTimeout: 5000,
    };

    /**
     * Timeout in milliseconds before the application is considered offline. Must be a positive integer.
     */
    readonly pingTimeout: number;

}

export const PingService = Symbol('PingService');
export interface PingService {
    ping(): Promise<void>;
}

@injectable()
export abstract class AbstractConnectionStatusService implements ConnectionStatusService, Disposable {

    protected readonly statusChangeEmitter = new Emitter<ConnectionStatus>();

    currentStatus = ConnectionStatus.ONLINE;

    @inject(ILogger)
    protected logger: ILogger;

    constructor(
        @inject(ConnectionStatusOptions) @optional() protected readonly options = ConnectionStatusOptions.DEFAULT
    ) { }

    get onStatusChange(): Event<ConnectionStatus> {
        return this.statusChangeEmitter.event;
    }

    dispose(): void {
        this.statusChangeEmitter.dispose();
    }

    protected updateStatus(online: boolean): void {
        const newStatus = online ? ConnectionStatus.ONLINE : ConnectionStatus.OFFLINE;
        if (this.currentStatus !== newStatus) {
            this.currentStatus = newStatus;
            this.fireStatusChange(this.currentStatus);
        }
    }

    protected fireStatusChange(status: ConnectionStatus): void {
        this.statusChangeEmitter.fire(status);
    }

}

@injectable()
export class FrontendConnectionStatusService extends AbstractConnectionStatusService {

    private scheduledPing?: number;

    @inject(PingService) protected readonly pingService: PingService;

    @postConstruct()
    protected init(): void {
        window.addEventListener('offline', () => {
            this.clearTimeout(this.scheduledPing);
            this.updateStatus(false);
        });
        window.addEventListener('online', () => {
            this.schedulePing();
        });
        // this.wsConnectionProvider.onSocketDidOpen(() => {
        //     this.updateStatus(true);
        //     this.schedulePing();
        // });
        // this.wsConnectionProvider.onSocketDidClose(() => {
        //     this.clearTimeout(this.scheduledPing);
        //     this.updateStatus(false);
        // });
        // this.wsConnectionProvider.onIncomingMessageActivity(() => {
        //     // natural activity
        //     this.updateStatus(true);
        //     this.schedulePing();
        // });
    }

    protected schedulePing(): void {
        this.clearTimeout(this.scheduledPing);
        this.scheduledPing = this.setTimeout(async () => {
            await this.ping();
            this.schedulePing();
        }, this.options.pingTimeout);
    }

    protected async ping(): Promise<void> {
        try {
            await this.pingService.ping();
            this.updateStatus(true);
        } catch (e) {
            this.updateStatus(false);
            this.logger.error(e);
        }
    }

    protected setTimeout(handler: () => void, timeout: number): number {
        return window.setTimeout(handler, timeout);
    }

    protected clearTimeout(handle?: number): void {
        if (handle !== undefined) {
            window.clearTimeout(handle);
        }
    }
}

@injectable()
export class ApplicationConnectionStatusContribution {

    protected readonly toDisposeOnOnline = new DisposableCollection();

    constructor(
        @inject(ConnectionStatusService) protected readonly connectionStatusService: ConnectionStatusService,
        @inject(StatusBar) protected readonly statusBar: StatusBar,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
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

    protected handleOnline(): void {
        this.toDisposeOnOnline.dispose();
        this.statusBar.removeElement(this.statusbarId);
        document.body.classList.remove('theia-mod-offline');
    }

    protected handleOffline(): void {
        this.statusBar.setElement(this.statusbarId, {
            alignment: StatusBarAlignment.LEFT,
            text: 'Offline',
            tooltip: 'Cannot connect to backend.',
            priority: 5000
        });
        document.body.classList.add('theia-mod-offline');
    }
}
