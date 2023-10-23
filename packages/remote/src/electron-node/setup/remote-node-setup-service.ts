// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import * as os from 'os';

import { inject, injectable } from '@theia/core/shared/inversify';
import { RequestService } from '@theia/core/shared/@theia/request';
import { RemoteSetupScriptService } from './remote-setup-script-service';
import { RemotePlatform } from '../remote-types';
import { OS } from '@theia/core';

/**
 * The current node version that Theia recommends.
 *
 * Native dependencies are compiled against this version.
 */
export const REMOTE_NODE_VERSION = '18.17.0';

@injectable()
export class RemoteNodeSetupService {

    @inject(RequestService)
    protected readonly requestService: RequestService;

    @inject(RemoteSetupScriptService)
    protected readonly scriptService: RemoteSetupScriptService;

    getNodeDirectoryName(platform: RemotePlatform): string {
        const platformId =
            platform.os === OS.Type.Windows ? 'win' :
                platform.os === OS.Type.Linux ? 'linux' : 'darwin';
        // Always use x64 architecture for now
        const arch = 'x64';
        const dirName = `node-v${REMOTE_NODE_VERSION}-${platformId}-${arch}`;
        return dirName;
    }

    getNodeFileName(platform: RemotePlatform): string {
        let fileExtension = '';
        if (platform.os === OS.Type.Windows) {
            fileExtension = 'zip';
        } else if (platform.os === OS.Type.OSX) {
            fileExtension = 'tar.gz';
        } else {
            fileExtension = 'tar.xz';
        }
        return `${this.getNodeDirectoryName(platform)}.${fileExtension}`;
    }

    async downloadNode(platform: RemotePlatform): Promise<string> {
        const fileName = this.getNodeFileName(platform);
        const tmpdir = os.tmpdir();
        const localPath = path.join(tmpdir, fileName);
        if (!await fs.pathExists(localPath)) {
            const downloadPath = this.getDownloadPath(fileName);
            const downloadResult = await this.requestService.request({
                url: downloadPath
            });
            await fs.writeFile(localPath, downloadResult.buffer);
        }
        return localPath;
    }

    generateDownloadScript(platform: RemotePlatform, targetPath: string): string {
        const fileName = this.getNodeFileName(platform);
        const downloadPath = this.getDownloadPath(fileName);
        const zipPath = this.scriptService.joinPath(platform, targetPath, fileName);
        const download = this.scriptService.downloadFile(platform, downloadPath, zipPath);
        const unzip = this.scriptService.unzip(platform, zipPath, targetPath);
        return this.scriptService.joinScript(platform, download, unzip);
    }

    protected getDownloadPath(fileName: string): string {
        return `https://nodejs.org/dist/v${REMOTE_NODE_VERSION}/${fileName}`;
    }

}
