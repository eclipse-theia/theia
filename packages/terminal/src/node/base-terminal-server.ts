/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify';
import { ILogger, DisposableCollection } from '@theia/core/lib/common';
import { IBaseTerminalServer, IBaseTerminalServerOptions, IBaseTerminalClient } from '../common/base-terminal-protocol';
import { TerminalProcess, ProcessManager } from '@theia/process/lib/node';

@injectable()
export abstract class BaseTerminalServer implements IBaseTerminalServer {
    protected client: IBaseTerminalClient | undefined = undefined;
    protected terminalToDispose = new Map<number, DisposableCollection>();

    constructor(
        @inject(ProcessManager) protected readonly processManager: ProcessManager,
        @inject(ILogger) @named('terminal') protected readonly logger: ILogger) {

        processManager.onDelete(id => {
            const toDispose = this.terminalToDispose.get(id);
            if (toDispose !== undefined) {
                toDispose.dispose();
                this.terminalToDispose.delete(id);
            }
        });
    }

    abstract create(options: IBaseTerminalServerOptions): Promise<number>;

    attach(id: number): Promise<number> {
        const term = this.processManager.get(id);

        if (term && term instanceof TerminalProcess) {
            return Promise.resolve(term.id);
        } else {
            this.logger.error(`Couldn't attach - can't find terminal with id: ${id} `);
            return Promise.resolve(-1);
        }
    }

    close(id: number): Promise<void> {
        const term = this.processManager.get(id);

        if (term instanceof TerminalProcess) {
            term.kill();
        }
        return Promise.resolve();
    }

    dispose(): void {
        // noop
    }

    resize(id: number, cols: number, rows: number): Promise<void> {
        const term = this.processManager.get(id);
        if (term && term instanceof TerminalProcess) {
            term.resize(cols, rows);
        } else {
            console.error("Couldn't resize terminal " + id + ", because it doesn't exist.");
        }
        return Promise.resolve();
    }

    /* Set the client to receive notifications on.  */
    setClient(client: IBaseTerminalClient | undefined) {
        this.client = client;
    }

    protected postCreate(term: TerminalProcess) {
        const toDispose = new DisposableCollection();

        toDispose.push(term.onError(error => {
            this.logger.error(`Terminal pid: ${term.pid} error: ${error}, closing it.`);

            if (this.client !== undefined) {
                this.client.onTerminalError(
                    {
                        'terminalId': term.id,
                        'error': error
                    });
            }
        }));

        toDispose.push(term.onExit(event => {
            if (this.client !== undefined) {
                this.client.onTerminalExitChanged(
                    {
                        'terminalId': term.id,
                        'code': event.code,
                        'signal': event.signal
                    });
            }
        }));

        this.terminalToDispose.set(term.id, toDispose);
    }

}
