/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Message } from "vscode-jsonrpc";
import { ILogger } from "../../common";

export interface ResolvedConnectionErrorHandlerOptions {
    readonly serverName: string
    readonly logger: ILogger
    /**
     * The maximum amout of errors allowed before stopping the server.
     */
    readonly maxErrors: number
    /**
     * The maimum amount of restarts allowed in the restart interval.
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
            // tslint:disable-next-line:max-line-length
            this.options.logger.error(`The ${this.options.serverName} server crashed ${this.options.maxRestarts} times in the last ${this.options.restartInterval} minutes. The server will not be restarted.`);
            return false;
        }
        this.restarts.shift();
        return true;
    }

}
