/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as stream from 'stream';
import { injectable, inject } from 'inversify';
import URI from "@theia/core/lib/common/uri";
import { ILogger } from "@theia/core/lib/common";
import { TerminalProcess, ProcessManager } from "@theia/process/lib/node";
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { openSocket } from '@theia/core/lib/node';

@injectable()
export class TerminalBackendContribution implements BackendApplicationContribution {

    constructor(
        @inject(ProcessManager) protected readonly processManager: ProcessManager,
        @inject(ILogger) protected readonly logger: ILogger) {
    }

    onStart(server: http.Server): void {
        openSocket({
            server,
            matches: (request) => {
                const uri = new URI(request.url!)
                return uri.path.toString().startsWith('/services/terminals/')
            }
        }, (ws, request) => {
            const uri = new URI(request.url!)
            const id = parseInt(uri.path.base, 10)
            let term = this.processManager.get(id);
            if (!term) {
                return;
            }

            const termStream = new stream.PassThrough();

            termStream.on('data', (data: any) => {
                try {
                    ws.send(data.toString());
                } catch (ex) {
                    console.error(ex)
                }
            });

            term.output.pipe(termStream);

            ws.on('message', (msg: any) => {
                if (term instanceof TerminalProcess) {
                    term.write(msg)
                }
            });
            ws.on('close', (msg: any) => {
                if (term !== undefined) {
                    this.processManager.delete(term);
                    term = undefined;
                }
            });
        });
    }
}
