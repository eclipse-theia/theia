/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import * as path from 'path';
import * as glob from 'glob';
import * as net from 'net';
import * as cp from 'child_process';
import { injectable } from "inversify";
import { JAVA_DESCRIPTION } from "../common";
import { DEBUG_MODE } from '../../application/node';
import { SocketMessageReader, SocketMessageWriter } from "../../messaging/common";
import { LanguageContribution, IConnection, createConnection, forward } from "../../languages/node";

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();
configurations.set('darwin', 'config_mac');
configurations.set('win32', 'config_win');
configurations.set('linux', 'config_linux');

@injectable()
export class JavaContribution implements LanguageContribution {

    readonly description = JAVA_DESCRIPTION;

    listen(clientConnection: IConnection): void {
        const serverPath = path.resolve(__dirname, 'server');
        const jarPaths = glob.sync('**/plugins/org.eclipse.equinox.launcher_*.jar', { cwd: serverPath });
        if (jarPaths.length === 0) {
            throw new Error('The java server launcher is not found.');
        }

        const jarPath = path.resolve(serverPath, jarPaths[0]);
        const workspacePath = path.resolve(os.tmpdir(), '_ws_' + new Date().getTime());
        const configuration = configurations.get(process.platform);
        const configurationPath = path.resolve(serverPath, configuration);
        const command = 'java';
        const args = [
            '-Declipse.application=org.eclipse.jdt.ls.core.id1',
            '-Dosgi.bundles.defaultStartLevel=4',
            '-Declipse.product=org.eclipse.jdt.ls.core.product'
        ];

        if (DEBUG_MODE) {
            args.push(
                '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=1044',
                '-Dlog.protocol=true',
                '-Dlog.level=ALL'
            );
        }

        args.push(
            '-jar', jarPath,
            '-configuration', configurationPath,
            '-data', workspacePath
        )

        Promise.all([
            this.startSocketServer(), this.startSocketServer()
        ]).then(servers => {
            const [inServer, outServer] = servers;
            const sockets = Promise.all([
                this.accept(inServer),
                this.accept(outServer),
            ]);

            this.logInfo('logs at ' + path.resolve(workspacePath, '.metadata', '.log'));
            const serverProcess = this.startServerProcess(command, args, {
                'STDIN_HOST': inServer.address().address,
                'STDIN_PORT': inServer.address().port,
                'STDOUT_HOST': outServer.address().address,
                'STDOUT_PORT': outServer.address().port
            });

            sockets.then(values => {
                const [inSocket, outSocket] = values;
                const reader = new SocketMessageReader(inSocket);
                const writer = new SocketMessageWriter(outSocket);

                const serverConnection = createConnection(reader, writer, () => serverProcess.kill());
                forward(clientConnection, serverConnection);
            });
        })
    }

    protected startSocketServer(): Promise<net.Server> {
        return new Promise(resolve => {
            const server = net.createServer()
            server.addListener('listening', () =>
                resolve(server)
            );
            // allocate ports dynamically
            server.listen(0, '127.0.0.1');
        });
    }

    protected accept(server: net.Server): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            server.on('error', reject);
            server.on('connection', socket => {
                // stop accepting new connections
                server.close();
                resolve(socket);
            });
        });
    }

    protected startServerProcess(command: string, args: string[], env: any): cp.ChildProcess {
        const serverProcess = cp.spawn(command, args, { env });
        serverProcess.stderr.on('data', this.logError.bind(this));
        serverProcess.stdout.on('data', this.logInfo.bind(this));
        return serverProcess;
    }

    protected logError(data: string | Buffer) {
        if (data) {
            console.error(`${this.description.name} Server: ${data}`)
        }
    }

    protected logInfo(data: string | Buffer) {
        if (data) {
            console.info(`${this.description.name} Server: ${data}`);
        }
    }

}
