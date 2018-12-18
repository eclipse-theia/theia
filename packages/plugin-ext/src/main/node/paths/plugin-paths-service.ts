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
import URI from '@theia/core/lib/common/uri';
import { isWindows } from '@theia/core';
import { PluginPaths } from './const';
import { PluginPathsService } from '../../common/plugin-paths-protocol';

// Service to provide configuration paths for plugin api.
@injectable()
export class PluginPathsServiceImpl implements PluginPathsService {

    private windowsConfFolders = [PluginPaths.APP_DATA_WINDOWS_FOLDER, PluginPaths.ROAMING_WINDOWS_FOLDER];
    private linuxConfFolders = [PluginPaths.LINUX_CONF_FOLDER];

    constructor(@inject(FileSystem) readonly fs: FileSystem) {
    }

    async provideHostLogPath(): Promise<string> {
        const parentLogDir = await this.getParentLogDirPath();

        if (!parentLogDir) {
            return Promise.reject(new Error('Unable to get parent log directory'));
        }

        if (parentLogDir && !await this.fs.exists(parentLogDir)) {
            await this.fs.createFolder(parentLogDir);
        }

        const pluginDirPath = join(parentLogDir, this.gererateTimeFolderName(), 'host');
        if (!await this.fs.exists(pluginDirPath)) {
            await this.fs.createFolder(pluginDirPath);
        }

        return new URI(pluginDirPath).path.toString();
    }

    /** Generate time folder name in format: YYYYMMDDTHHMMSS, for example: 20181205T093828 */
    gererateTimeFolderName(): string {
        return new Date().toISOString().replace(/[-:]|(\..*)/g, '');
    }

    async getParentLogDirPath(): Promise<string | undefined> {
        const userHomeDir = await this.fs.getCurrentUserHome();
        let parentLogDirPath;
        if (userHomeDir) {
            parentLogDirPath = join(
                userHomeDir.uri,
                ...(isWindows ? this.windowsConfFolders : this.linuxConfFolders),
                PluginPaths.APPLICATION_CONF_FOLDER,
                PluginPaths.LOG_PARENT_FOLDER_NAME
            );
        }
        return parentLogDirPath;
    }
}
