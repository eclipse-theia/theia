// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { injectable } from '@theia/core/shared/inversify';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { dirname, basename } from 'path';
import { LlamafileServerManager, LlamafileServerManagerClient } from '../common/llamafile-server-manager';
import { fileURLToPath } from 'url';

@injectable()
export class LlamafileServerManagerImpl implements LlamafileServerManager {

    private processMap: Map<string, ChildProcessWithoutNullStreams> = new Map();
    private client: LlamafileServerManagerClient;

    startServer(name: string, uri: string, port: number): void {
        if (!this.processMap.has(name)) {
            const filePath = fileURLToPath(uri);

            // Extract the directory and file name
            const dir = dirname(filePath);
            const fileName = basename(filePath);
            const currentProcess = spawn(`./${fileName}`, ['--port', '' + port, '--server', '--nobrowser'], { cwd: dir });
            this.processMap.set(name, currentProcess);
            currentProcess.stdout.on('data', (data: Buffer) => {
                const output = data.toString();
                this.client.log(name, output);
            });
            currentProcess.stderr.on('data', (data: Buffer) => {
                const output = data.toString();
                this.client.error(name, output);
            });
            currentProcess.on('close', code => {
                this.client.log(name, `LlamaFile process exited with code ${code}`);
                this.processMap.delete(name);
            });
        }
    }

    killServer(name: string): void {
        if (this.processMap.has(name)) {
            const currentProcess = this.processMap.get(name);
            currentProcess!.kill();
            this.processMap.delete(name);
        }
    }

    isStarted(name: string): boolean {
        return this.processMap.has(name);
    }

    setClient(client: LlamafileServerManagerClient): void {
        this.client = client;
    }

}
