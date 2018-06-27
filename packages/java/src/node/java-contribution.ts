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
        const serverPath = path.resolve(__dirname, '..', '..', 'server');
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
                '-Dlog.level=ALL'
            );
        }

        args.push(
            '-jar', jarPath,
            '-configuration', configurationPath,
            '-data', workspacePath
        );

        this.startSocketServer().then(server => {
            const socket = this.accept(server);

            this.logInfo('logs at ' + path.resolve(workspacePath, '.metadata', '.log'));
            const env = Object.create(process.env);
            const address = server.address();
            env.CLIENT_HOST = address.address;
            env.CLIENT_PORT = address.port;
            this.createProcessSocketConnection(socket, socket, command, args, { env })
                .then(serverConnection => this.forward(clientConnection, serverConnection));
        });
    }
}
