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
import pathLibrary = require('path');
import { LlamafileServerManager } from '../common/llamafile-server-manager';

@injectable()
export class BackendLlamafileServerManager implements LlamafileServerManager {

    activeServer: string | undefined = undefined;
    processMap: Map<string, ChildProcessWithoutNullStreams> = new Map();

    startServer(name: string, path: string, port: number): void {
        if (!this.processMap.has(name)) {
            // TODO: Make platform independent
            // Remove 'file:///' and extract the file path
            const filePath = path.replace('file:///', '/');

            // Extract the directory and file name
            const dir = pathLibrary.dirname(filePath);
            const fileName = pathLibrary.basename(filePath);
            const currentProcess = spawn(`./${fileName}`, ['--port', '' + port, '--server', '--nobrowser'], { cwd: dir });
            this.processMap.set(name, currentProcess);
            currentProcess.stdout.on('data', (data: Buffer) => {
                const output = data.toString();
                // TODO: Make better logging mechanism
                console.log(output);
            });
            currentProcess.stderr.on('data', (data: Buffer) => {
                const output = data.toString();
                // TODO: Make better logging mechanism
                console.log(output);
            });
            currentProcess.on('close', code => {
                console.log(`LlamaFile process exited with code ${code}`);
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
        if (this.activeServer === name) {
            this.activeServer = undefined;
        }
    }

    setAsActive(name: string): void {
        this.activeServer = name;
    }
    isActive(name: string): boolean {
        if (this.activeServer === undefined) {
            return false;
        }
        return name === this.activeServer;
    }

}
