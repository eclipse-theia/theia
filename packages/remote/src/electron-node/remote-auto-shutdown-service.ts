// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { MaybePromise } from '@theia/core/lib/common/types';
import { MessagingListenerContribution } from '@theia/core/lib/node/messaging/messaging-listeners';
import { CliContribution } from '@theia/core/lib/node';
import { Arguments, Argv } from '@theia/core/shared/yargs';
import * as http from 'http';
import { Socket } from 'socket.io';

export const REMOTE_AUTO_SHUTDOWN = 'remote-auto-shutdown';
export const REMOTE_AUTO_SHUTDOWN_TIMEOUT = 'remote-auto-shutdown-timeout';

/** Default timeout: 5 minutes (same as VS Code). */
const DEFAULT_SHUTDOWN_TIMEOUT = 5 * 60 * 1000;

/**
 * Tracks active frontend WebSocket connections on a remote backend.
 * When auto-shutdown is enabled and all connections close, starts a
 * timer and calls `process.exit(0)` if no new connection arrives
 * before the timeout.
 */
@injectable()
export class RemoteAutoShutdownService implements MessagingListenerContribution, CliContribution {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected enabled = false;
    protected shutdownTimeout = DEFAULT_SHUTDOWN_TIMEOUT;
    protected activeConnections = 0;
    protected shutdownTimer: ReturnType<typeof setTimeout> | undefined;

    configure(conf: Argv): void {
        conf.option(REMOTE_AUTO_SHUTDOWN, {
            description: 'Automatically shut down the remote backend when all frontend connections close',
            type: 'boolean',
            default: false
        });
        conf.option(REMOTE_AUTO_SHUTDOWN_TIMEOUT, {
            description: 'Timeout in milliseconds before auto-shutdown after the last connection closes',
            type: 'number',
            default: DEFAULT_SHUTDOWN_TIMEOUT
        });
    }

    setArguments(args: Arguments): void {
        this.enabled = Boolean(args[REMOTE_AUTO_SHUTDOWN]);
        const timeout = Number(args[REMOTE_AUTO_SHUTDOWN_TIMEOUT]);
        if (!isNaN(timeout) && timeout > 0) {
            this.shutdownTimeout = timeout;
        }

        if (this.enabled) {
            // Start the initial timer — if no frontend connects within the timeout, shut down
            this.scheduleShutdown();
        }
    }

    onDidWebSocketUpgrade(request: http.IncomingMessage, socket: Socket): MaybePromise<void> {
        this.activeConnections++;
        this.logger.debug(`RemoteAutoShutdown: connection opened (active: ${this.activeConnections})`);

        this.cancelShutdown();

        socket.on('disconnect', () => {
            this.activeConnections = Math.max(0, this.activeConnections - 1);
            this.logger.debug(`RemoteAutoShutdown: connection closed (active: ${this.activeConnections})`);

            if (this.activeConnections === 0 && this.enabled) {
                this.scheduleShutdown();
            }
        });
    }

    protected scheduleShutdown(): void {
        this.cancelShutdown();
        this.logger.debug(`RemoteAutoShutdown: scheduling shutdown in ${this.shutdownTimeout}ms`);
        this.shutdownTimer = setTimeout(() => {
            this.shutdownTimer = undefined;
            this.tryShutdown();
        }, this.shutdownTimeout);
    }

    protected tryShutdown(): void {
        if (this.activeConnections > 0) {
            this.logger.debug('RemoteAutoShutdown: consumer connected before shutdown, aborting');
            return;
        }
        this.logger.info('RemoteAutoShutdown: no active connections, shutting down');
        // process.exit triggers the 'exit' event, which BackendApplication handles
        // by calling onStop() on all contributions. Theia's onStop() contract is
        // synchronous-only (returns void, not MaybePromise<void>), so process.exit
        // does not skip any cleanup — there is no async shutdown mechanism to miss.
        process.exit(0);
    }

    protected cancelShutdown(): void {
        if (this.shutdownTimer) {
            this.logger.debug('RemoteAutoShutdown: cancelling shutdown timer');
            clearTimeout(this.shutdownTimer);
            this.shutdownTimer = undefined;
        }
    }
}
