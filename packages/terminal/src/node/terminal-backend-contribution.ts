/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as https from 'https';
import { injectable, inject, named } from 'inversify';
import URI from "@theia/core/lib/common/uri";
import { ILogger } from "@theia/core/lib/common";
import { TerminalProcess, ProcessManager, MultiRingBufferReadableStream } from "@theia/process/lib/node";
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { openSocket } from '@theia/core/lib/node';
import { terminalsPath } from '../common/terminal-protocol';

@injectable()
export class TerminalBackendContribution implements BackendApplicationContribution {

    constructor(
        @inject(ProcessManager) protected readonly processManager: ProcessManager,
        @inject(ILogger) @named('terminal') protected readonly logger: ILogger) {
    }

    onStart(server: http.Server | https.Server): void {
        openSocket({
            server,
            matches: request => {
                const uri = new URI(request.url!);
                return uri.path.toString().startsWith(`${terminalsPath}/`);
            }
        }, (ws, request) => {
            const uri = new URI(request.url!);
            const id = parseInt(uri.path.base, 10);
            const termProcess = this.processManager.get(id);
            if (!(termProcess instanceof TerminalProcess)) {
                return;
            }

            /* Note this typecast will be refactored after #841 */
            const output: MultiRingBufferReadableStream | undefined = termProcess.createOutputStream();
            output.on('data', (data: string) => {
                try {
                    ws.send(data);
                } catch (ex) {
                    this.logger.warn(ex.message, ex);
                }
            });

            ws.on('error', err => {
                this.logger.warn(err.message, err);
            });

            ws.on('message', (msg: any) => {
                if (termProcess instanceof TerminalProcess) {
                    termProcess.write(msg);
                }
            });
            // tslint:disable-next-line:no-any
            ws.on('close', (msg: any) => {
                output.dispose();
            });
        });
    }
}
