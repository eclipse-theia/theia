/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { IBaseTerminalServer, IBaseTerminalServerOptions, IBaseTerminalClient } from '../common/base-terminal-protocol';
import { TerminalProcess, ProcessManager } from '@theia/process/lib/node';
import URI from "@theia/core/lib/common/uri";

@injectable()
export abstract class BaseTerminalServer implements IBaseTerminalServer {
    protected client: IBaseTerminalClient | undefined = undefined;

    constructor(
        @inject(ProcessManager) protected readonly processManager: ProcessManager,
        @inject(ILogger) protected readonly logger: ILogger) {
    }

    abstract create(options: IBaseTerminalServerOptions): Promise<number>;

    dispose(): void {
        // noop
    }

    resize(id: number, cols: number, rows: number): Promise<void> {
        const term = this.processManager.get(id);
        if (term && term instanceof TerminalProcess) {
            term.resize(cols, rows);
        } else {
            console.error("Couldn't resize terminal " + id + ", because it doesn't exist.")
        }
        return Promise.resolve();
    }

    /* Set the client to receive notifications on.  */
    setClient(client: IBaseTerminalClient | undefined) {
        this.client = client;
    }

    setRootURI(term: TerminalProcess, rootURI: string) {

        const uri = new URI(rootURI);
        term.write(`cd ${uri.path} && `);
        term.write("source ~/.profile\n");

    }

    protected postCreate(term: TerminalProcess) {
        term.onError(error => {
            this.logger.error(`Terminal pid: ${term.pid} error: ${error}, closing it.`);

            if (this.client !== undefined) {
                this.client.onTerminalError(
                    {
                        'terminalId': term.id,
                        'error': error
                    });
            }
            term.dispose();
        });

        term.onExit(event => {
            if (this.client !== undefined) {
                this.client.onTerminalExitChanged(
                    {
                        'terminalId': term.id,
                        'code': event.code,
                        'signal': event.signal
                    });
            }
            term.dispose();
        });
    }

}
