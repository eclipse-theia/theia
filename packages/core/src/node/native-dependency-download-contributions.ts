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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from 'inversify';
import { DependencyDownloadContribution, DirectoryDependencyDownload, DownloadOptions, FileDependencyDownload } from './dependency-download';

@injectable()
export class DrivelistDependencyDownload implements DependencyDownloadContribution {
    dependencyId = 'drivelist';

    async download(options: DownloadOptions): Promise<FileDependencyDownload | DirectoryDependencyDownload> {
        return {
            file: {
                targetFile: 'lib/backend/native/drivelist.node'
            },
            unzip: true,
            downloadHandler: await options.download(DependencyDownloadContribution.getDefaultURLForFile('drivelist', options.remoteOS, options.theiaVersion))
        };
    }
}

@injectable()
export class keytarDependencyDownload implements DependencyDownloadContribution {
    dependencyId = 'keytar';

    async download(options: DownloadOptions): Promise<FileDependencyDownload | DirectoryDependencyDownload> {
        return {
            file: {
                targetFile: 'lib/backend/native/keytar.node'
            },
            unzip: true,
            downloadHandler: await options.download(DependencyDownloadContribution.getDefaultURLForFile('keytar', options.remoteOS, options.theiaVersion))
        };
    }
}

@injectable()
export class NSFWDependencyDownload implements DependencyDownloadContribution {
    dependencyId = 'nsfw';

    async download(options: DownloadOptions): Promise<FileDependencyDownload | DirectoryDependencyDownload> {
        return {
            file: {
                targetFile: 'lib/backend/native/nsfw.node'
            },
            unzip: true,
            downloadHandler: await options.download(DependencyDownloadContribution.getDefaultURLForFile('nsfw', options.remoteOS, options.theiaVersion))
        };
    }
}

const BASE_URL = 'https://github.com/microsoft/ripgrep-prebuilt/releases/download/v13.0.0-8/ripgrep-v13.0.0-8';
@injectable()
export class RigrepDependencyDownload implements DependencyDownloadContribution {
    dependencyId = 'rigrep';
    async download(options: DownloadOptions): Promise<FileDependencyDownload | DirectoryDependencyDownload> {
        return {
            file: {
                targetFile: `lib/backend/native/rg${options.remoteOS.startsWith('win32') ? '.exe' : ''}`
            },
            unzip: true,
            downloadHandler: await options.download(this.getDownloadUrl(options.remoteOS))
        };
    }

    getDownloadUrl(remoteOS: string): string {
        const [platform, architecure] = remoteOS.split('-');

        let transformedPlatform: string;
        if (remoteOS.includes('darwin')) {
            transformedPlatform = 'apple-darwin';
        } else if (remoteOS.includes('win')) {
            transformedPlatform = 'pc-windows-msvc';
        } else {
            transformedPlatform = 'unkown-linux-gnu';
        }

        return `${BASE_URL}-${architecure === 'x64' ? 'x86_64' : architecure}-${transformedPlatform}.${platform.includes('win') ? 'zip' : 'tar.gz'}`;
    }
}
