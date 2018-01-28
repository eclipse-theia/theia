/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import * as path from 'path';
import * as glob from 'glob';
import { injectable } from "inversify";
import { DEBUG_MODE } from '@theia/core/lib/node';
import { IConnection, BaseLanguageServerContribution } from "@theia/languages/lib/node";
import { JAVA_LANGUAGE_ID, JAVA_LANGUAGE_NAME } from '../common';

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();
configurations.set('darwin', 'config_mac');
configurations.set('win32', 'config_win');
configurations.set('linux', 'config_linux');

@injectable()
export class JavaContribution extends BaseLanguageServerContribution {

    readonly id = JAVA_LANGUAGE_ID;
    readonly name = JAVA_LANGUAGE_NAME;

    start(clientConnection: IConnection): void {
        const serverPath = path.resolve(__dirname, 'server');
        const jarPaths = glob.sync('**/plugins/org.eclipse.equinox.launcher_*.jar', { cwd: serverPath });
        if (jarPaths.length === 0) {
            throw new Error('The Java server launcher is not found.');
        }

        const jarPath = path.resolve(serverPath, jarPaths[0]);
        const workspacePath = path.resolve(os.tmpdir(), '_ws_' + new Date().getTime());
        const configuration = configurations.get(process.platform);
        if (!configuration) {
            throw new Error('Cannot find Java server configuration for ' + process.platform);
        }
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
        );

        Promise.all([
            this.startSocketServer(), this.startSocketServer()
        ]).then(servers => {
            const [inServer, outServer] = servers;
            const inSocket = this.accept(inServer);
            const outSocket = this.accept(outServer);

            this.logInfo('logs at ' + path.resolve(workspacePath, '.metadata', '.log'));
            const env = Object.create(process.env);
            env.STDIN_HOST = inServer.address().address;
            env.STDIN_PORT = inServer.address().port;
            env.STDOUT_HOST = outServer.address().address;
            env.STDOUT_PORT = outServer.address().port;
            this.createProcessSocketConnection(inSocket, outSocket, command, args, { env })
                .then(serverConnection => this.forward(clientConnection, serverConnection));
        });
    }
}
