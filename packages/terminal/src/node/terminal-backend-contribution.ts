/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
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
            matches: request => {
                const uri = new URI(request.url!);
                return uri.path.toString().startsWith('/services/terminals/');
            }
        }, (ws, request) => {
            const uri = new URI(request.url!);
            const id = parseInt(uri.path.base, 10);
            const termProcess = this.processManager.get(id);
            if (!(termProcess instanceof TerminalProcess)) {
                return;
            }

            /* Note this typecast will be refactored after #841 */
            const output = termProcess.createOutputStream();
            output.on('data', (data: string) => {
                try {
                    ws.send(data);
                } catch (ex) {
                    console.error(ex);
                }
            });

            ws.on('message', (msg: any) => {
                if (termProcess instanceof TerminalProcess) {
                    termProcess.write(msg);
                }
            });
            // tslint:disable-next-line:no-any
            ws.on('close', (msg: any) => {
                output.dispose();
                if (termProcess !== undefined) {
                    termProcess.kill();
                }
            });
        });
    }
}
