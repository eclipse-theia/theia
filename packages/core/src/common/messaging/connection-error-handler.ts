/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { Message } from 'vscode-ws-jsonrpc';
import { ILogger } from '../../common';

export interface ResolvedConnectionErrorHandlerOptions {
    readonly serverName: string
    readonly logger: ILogger
    /**
     * The maximum amount of errors allowed before stopping the server.
     */
    readonly maxErrors: number
    /**
     * The minimum amount of restarts allowed in the restart interval.
     */
    readonly maxRestarts: number
    /**
     * In minutes.
     */
    readonly restartInterval: number
}

export type ConnectionErrorHandlerOptions = Partial<ResolvedConnectionErrorHandlerOptions> & {
    readonly serverName: string
    readonly logger: ILogger
};

export class ConnectionErrorHandler {

    protected readonly options: ResolvedConnectionErrorHandlerOptions;
    constructor(options: ConnectionErrorHandlerOptions) {
        this.options = {
            maxErrors: 3,
            maxRestarts: 5,
            restartInterval: 3,
            ...options
        };
    }

    shouldStop(error: Error, message?: Message, count?: number): boolean {
        return !count || count > this.options.maxErrors;
    }

    protected readonly restarts: number[] = [];
    shouldRestart(): boolean {
        this.restarts.push(Date.now());
        if (this.restarts.length <= this.options.maxRestarts) {
            return true;
        }
        const diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
        if (diff <= this.options.restartInterval * 60 * 1000) {
            // eslint-disable-next-line max-len
            this.options.logger.error(`The ${this.options.serverName} server crashed ${this.options.maxRestarts} times in the last ${this.options.restartInterval} minutes. The server will not be restarted.`);
            return false;
        }
        this.restarts.shift();
        return true;
    }

}
