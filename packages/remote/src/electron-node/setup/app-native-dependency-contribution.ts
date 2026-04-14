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

import { injectable } from '@theia/core/shared/inversify';
import { RemoteNativeDependencyContribution, DownloadOptions, DependencyDownload } from './remote-native-dependency-contribution';
import { RemotePlatform } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { OS } from '@theia/core';

/**
 * GitHub release tag used for rolling pre-release publications of native
 * dependencies for next-channel Theia versions (e.g. `1.71.0-next.28+sha`).
 * Stable versions resolve to a `v<version>` tag instead.
 */
export const NEXT_RELEASE_TAG = 'next';

@injectable()
export class AppNativeDependencyContribution implements RemoteNativeDependencyContribution {

    appDownloadUrlBase = 'https://github.com/eclipse-theia/theia/releases/download';

    protected getDefaultURLForFile(remotePlatform: RemotePlatform, theiaVersion: string): string {
        this.validatePlatform(remotePlatform);
        return `${this.appDownloadUrlBase}/${this.getReleaseTag(theiaVersion)}/${this.getAssetName(remotePlatform)}`;
    }

    /**
     * Returns the GitHub release tag from which to download the native dependencies.
     * Next-channel versions (containing `-next.`) resolve to the rolling `next`
     * pre-release; stable versions resolve to `v<theiaVersion>`.
     */
    protected getReleaseTag(theiaVersion: string): string {
        return /-next\./.test(theiaVersion) ? NEXT_RELEASE_TAG : `v${theiaVersion}`;
    }

    protected getAssetName(remotePlatform: RemotePlatform): string {
        let platform: string;
        if (remotePlatform.os === OS.Type.Windows) {
            platform = 'win32';
        } else if (remotePlatform.os === OS.Type.OSX) {
            platform = 'darwin';
        } else {
            platform = 'linux';
        }
        return `native-dependencies-${platform}-${remotePlatform.arch}.zip`;
    }

    /**
     * Validates that native dependencies are actually published for the given
     * remote platform. The set of supported (os, arch) pairs mirrors the set
     * accepted by `RemoteNodeSetupService.validatePlatform`, minus combinations
     * for which we don't yet build native-dependency zips in CI.
     */
    protected validatePlatform(remotePlatform: RemotePlatform): void {
        const { os, arch } = remotePlatform;
        const supported =
            (os === OS.Type.Windows && arch === 'x64') ||
            (os === OS.Type.Linux && arch === 'x64') ||
            (os === OS.Type.OSX && (arch === 'x64' || arch === 'arm64'));
        if (!supported) {
            throw new Error(`No prebuilt native dependencies are published for '${os}-${arch}'.`);
        }
    }

    async download(options: DownloadOptions): Promise<DependencyDownload> {
        return {
            buffer: await options.download(this.getDefaultURLForFile(options.remotePlatform, options.theiaVersion)),
            archive: 'zip'
        };
    }
}
