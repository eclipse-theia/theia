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

import { injectable } from 'inversify';
import { RemoteNativeDependencyContribution, DownloadOptions, DependencyDownload, RemotePlatform } from './remote-native-dependency-contribution';

@injectable()
export class AppNativeDependencyContribution implements RemoteNativeDependencyContribution {

    // TODO: Points for testing purposes to a non-theia repo
    // Should be replaced with:
    // 'https://github.com/eclipse-theia/theia/releases/download'
    appDownloadUrlBase = 'https://github.com/msujew/theia/releases/download';

    getDefaultURLForFile(remotePlatform: RemotePlatform, theiaVersion: string): string {
        return `${this.appDownloadUrlBase}/v${theiaVersion}/native-dependencies-${remotePlatform}-x64.zip`;
    }

    async download(options: DownloadOptions): Promise<DependencyDownload> {
        return {
            buffer: await options.download(this.getDefaultURLForFile(options.remotePlatform, options.theiaVersion)),
            archive: 'zip'
        };
    }
}
