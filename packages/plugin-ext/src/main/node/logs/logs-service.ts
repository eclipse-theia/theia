/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from  'inversify';
import { FileSystem } from '@theia/filesystem/lib/common';
import { join } from 'path';
import { PluginConf } from '../config/const';
import URI from '@theia/core/lib/common/uri';
import { isWindows } from '@theia/core';

export const logServicePath = '/services/logs';

export const LogService = Symbol('LogService');
export interface LogService {
    // Return hosted log dir. Create this folder if it is not exist on the file system.
    provideHostLogDir(): Promise<string>
}

@injectable()
export class LogServiceImpl implements LogService {
    private logDirName: string = 'logs';
    private windowsConfFolders = [PluginConf.APP_DATA_WINDOWS_FOLDER, PluginConf.ROAMING_WINDOWS_FOLDER];
    private linuxConfFolders = [PluginConf.LINUX_CONF_FOLDER];

    constructor(@inject(FileSystem) readonly fs: FileSystem) {
    }

    async provideHostLogDir(): Promise<string> {
        const parentLogDir = await this.getParentLogDirPath();

        if (!parentLogDir) {
            return Promise.reject('Unable to get parent log directory');
        }

        if (parentLogDir && !this.fs.exists(parentLogDir)) {
            this.fs.createFolder(parentLogDir);
        }

        const pluginDirPath = join(parentLogDir, this.gererateTimeFolderName(), 'host');
        console.log('resolved plugin path is ' + pluginDirPath + ' this path exists ' + (await this.fs.exists(pluginDirPath)));
        if (! await this.fs.exists(pluginDirPath)) {
            this.fs.createFolder(pluginDirPath);
        }

        return new URI(pluginDirPath).path.toString();
    }

    /** Generate time folder name in format: YYYYMMDDTHHMMSS, for example: 20181205T093828 */
    gererateTimeFolderName(): string {
        return new Date().toISOString().replace(/[-:]|(\..*)/g, '');
    }

    async getParentLogDirPath(): Promise<string | undefined> { // Todo cache this path
        const userHomeDir = await this.fs.getCurrentUserHome();
        let parentLogDirPath;
        if (userHomeDir) {
            parentLogDirPath = join(
                userHomeDir.uri,
                ...(isWindows ? this.windowsConfFolders : this.linuxConfFolders),
                PluginConf.APPLICATION_CONF_FOLDER,
                this.logDirName
            );
        }
        return parentLogDirPath;
    }
}
