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
import { RemotePlatform } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { OS } from '@theia/core';

/**
 * The current node version that Theia recommends.
 *
 * Native dependencies are compiled against this version.
 */
export const REMOTE_NODE_VERSION = '22.17.0';

@injectable()
export class RemoteNodeSetupService {

    @inject(RequestService)
    protected readonly requestService: RequestService;

    @inject(RemoteSetupScriptService)
    protected readonly scriptService: RemoteSetupScriptService;

    getNodeDirectoryName(platform: RemotePlatform): string {
        return `node-v${REMOTE_NODE_VERSION}-${this.getPlatformName(platform)}-${platform.arch}`;
    }

    protected getPlatformName(platform: RemotePlatform): string {
        let platformId: string;
        if (platform.os === OS.Type.Windows) {
            platformId = 'win';
        } else if (platform.os === OS.Type.OSX) {
            platformId = 'darwin';
        } else {
            platformId = 'linux';
        }
        return platformId;
    }

    protected validatePlatform(platform: RemotePlatform): void {
        if (platform.os === OS.Type.Windows && !platform.arch.match(/^x(64|86)$/)) {
            this.throwPlatformError(platform, 'x64 and x86');
        } else if (platform.os === OS.Type.Linux && !platform.arch.match(/^(x64|armv7l|arm64)$/)) {
            this.throwPlatformError(platform, 'x64, armv7l and arm64');
        } else if (platform.os === OS.Type.OSX && !platform.arch.match(/^(x64|arm64)$/)) {
            this.throwPlatformError(platform, 'x64 and arm64');
        }
    }

    protected throwPlatformError(platform: RemotePlatform, supportedArch: string): never {
        throw new Error(`Invalid architecture for ${platform.os}: '${platform.arch}'. Only ${supportedArch} are supported.`);
    }

    protected getNodeFileExtension(platform: RemotePlatform): string {
        let fileExtension: string;
        if (platform.os === OS.Type.Windows) {
            fileExtension = 'zip';
        } else if (platform.os === OS.Type.OSX) {
            fileExtension = 'tar.gz';
        } else {
            fileExtension = 'tar.xz';
        }
        return fileExtension;
    }

    getNodeFileName(platform: RemotePlatform): string {
        return `${this.getNodeDirectoryName(platform)}.${this.getNodeFileExtension(platform)}`;
    }

    async downloadNode(platform: RemotePlatform, downloadTemplate?: string): Promise<string> {
        this.validatePlatform(platform);
        const fileName = this.getNodeFileName(platform);
        const tmpdir = os.tmpdir();
        const localPath = path.join(tmpdir, fileName);
        if (!await fs.pathExists(localPath)) {
            const downloadPath = this.getDownloadPath(platform, downloadTemplate);
            const downloadResult = await this.requestService.request({
                url: downloadPath
            });
            await fs.writeFile(localPath, downloadResult.buffer);
        }
        return localPath;
    }

    generateDownloadScript(platform: RemotePlatform, targetPath: string, downloadTemplate?: string): string {
        this.validatePlatform(platform);
        const fileName = this.getNodeFileName(platform);
        const downloadPath = this.getDownloadPath(platform, downloadTemplate);
        const zipPath = this.scriptService.joinPath(platform, targetPath, fileName);
        const download = this.scriptService.downloadFile(platform, downloadPath, zipPath);
        const unzip = this.scriptService.unzip(platform, zipPath, targetPath);
        return this.scriptService.joinScript(platform, download, unzip);
    }

    protected getDownloadPath(platform: RemotePlatform, downloadTemplate?: string): string {
        const template = downloadTemplate || 'https://nodejs.org/dist/v{version}/node-v{version}-{os}-{arch}.{ext}';
        const downloadPath = template
            .replace(/{version}/g, REMOTE_NODE_VERSION)
            .replace(/{os}/g, this.getPlatformName(platform))
            .replace(/{arch}/g, platform.arch)
            .replace(/{ext}/g, this.getNodeFileExtension(platform));
        return downloadPath;
    }
}
