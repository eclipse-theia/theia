/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from 'inversify';
import { ILogger } from "@theia/core/lib/common";
import { TerminalProcess, ProcessManager } from "@theia/process/lib/node";
import { terminalsPath } from '../common/terminal-protocol';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';

@injectable()
export class TerminalBackendContribution implements MessagingService.Contribution {

    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    @inject(ILogger) @named('terminal')
    protected readonly logger: ILogger;

    configure(service: MessagingService): void {
        service.listen(`${terminalsPath}/:id`, (params: { id: string }, connection) => {
            const id = parseInt(params.id, 10);
            const termProcess = this.processManager.get(id);
            if (termProcess instanceof TerminalProcess) {
                const output = termProcess.createOutputStream();
                output.on('data', data => connection.sendNotification('onData', data.toString()));
                connection.onRequest('write', (data: string) => termProcess.write(data));
                connection.onClose(() => output.dispose());
                connection.listen();
            } else {
                connection.dispose();
            }
        });
    }

}
