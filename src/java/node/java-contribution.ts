/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import { injectable } from "inversify";
import { LanguageContribution, IConnection, createServerProcess, forward } from "../../languages/node";

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();
configurations.set('darwin', 'config_mac');
configurations.set('win32', 'config_win');
configurations.set('linux', 'config_linux');

@injectable()
export class JavaContribution implements LanguageContribution {

    readonly description = {
        id: 'java',
        name: 'Java',
        documentSelector: ['java'],
        fileEvents: [
            '**/*.java', '**/pom.xml', '**/*.gradle'
        ]
    }

    listen(clientConnection: IConnection): void {
        const projectPath = path.resolve(__dirname, '../../..');
        const serverPath = path.resolve(projectPath, '../eclipse.jdt.ls/org.eclipse.jdt.ls.product/target/repository');
        const jarPath = path.resolve(serverPath, 'plugins/org.eclipse.equinox.launcher_1.4.0.v20161219-1356.jar');
        const workspacePath = path.resolve(projectPath, '../../ws');
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
