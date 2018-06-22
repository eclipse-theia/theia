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

import { Worker } from 'cluster';
import { DataCallback } from 'vscode-jsonrpc';
import { MessageReader, AbstractMessageReader } from 'vscode-jsonrpc/lib/messageReader';

export class WorkerMessageReader extends AbstractMessageReader implements MessageReader {

    constructor(
        protected readonly worker: Worker
    ) {
        super();
    }

    listen(callback: DataCallback): void {
        this.worker.on('exit', (code, signal) => {
            if (code !== 0) {
                const error: Error = {
                    name: '' + code,
                    message: `Worker exited with '${code}' error code and '${signal}' signal`
                };
                this.fireError(error);
            }
            this.fireClose();
        });
        this.worker.on('error', e =>
            this.fireError(e)
        );
        this.worker.on('message', callback);
    }

}
