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
import { LanguageContribution, IConnection, createServerProcess, forward } from "../../languages/node";
import { JAVA_DESCRIPTION } from "../common";

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
            '-Declipse.product=org.eclipse.jdt.ls.core.product',
            '-Dlog.protocol=true',
            '-Dlog.level=ALL',
            '-noverify',
            '-Xmx1G',
            '-jar', jarPath,
            '-configuration', configurationPath,
            '-data', workspacePath
        ];
        const serverConnection = createServerProcess(this.description.name, command, args);
        forward(clientConnection, serverConnection);
    }

}
