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

import { NodeRequestOptions } from '@theia/request/lib/node-request-service';
import { MaybePromise } from 'src/common';
export interface FileDependencyResult {
    targetFile: string;
    /** Some files needs to be made executable on the target system */
    chmod?: number;
}

export interface FileDependencyDownload {
    /** Defaults to `true` */
    unzip?: boolean;
    file: FileDependencyResult
    downloadHandler: string | Buffer | (() => Promise<Buffer | string>)
}

// Directories are expected to be in a zipped format anyway
// We always unzip them and call `files` on each contained file
export interface DirectoryDependencyDownload {
    files: (path: string) => FileDependencyResult;
    downloadHandler: string | Buffer | (() => Promise<Buffer | string>)
}

export interface DownloadOptions {
    remoteOS: string;
    theiaVersion: string;
    /**
     * These are the `NodeRequestOptions` for the `NodeRequestService`
     * returns undefined when url from requestInfo has been downloaded previously
     */
    download: (requestInfo: string | NodeRequestOptions) => Promise<Buffer>
}

/**
 * contribution used for downloading prebuild nativ dependency when connecting to a remote machine with a different system
 */
export interface DependencyDownloadContribution {
    // used to filter out multiple contributions downloading the same package
    dependencyId: string;

    download(options: DownloadOptions): MaybePromise<FileDependencyDownload | DirectoryDependencyDownload>;
}

export namespace DependencyDownloadContribution {
    export const Contribution = Symbol('dependencyDownloadContribution');

    const DEFAULT_DEPENDENCY_DOWNLOAD_URL = 'https://github.com/eclipse-theia/theia/releases';

    export function getDefaultURLForFile(dependencyName: string, remoteSystem: string, theiaVersion: string): string {
        return `${DEFAULT_DEPENDENCY_DOWNLOAD_URL}/${theiaVersion ? `tag/v${theiaVersion}` : 'latest'}/${dependencyName}-${remoteSystem}.zip`;
    }

}

export const DependencyDownloadService = Symbol('dependencyDownloadService');
/**
 * used by the "@theia/remote" package to donwload nativ dependencies for the remote system;
 */
export interface DependencyDownloadService {

    /**
     * downloads natvie dependencies for copying on a remote machine
     * @param remoteSystem the operating system of the remote machine in format "{platform}-{architecure}"" e.g. "win32-x64"
     */
    downloadDependencies(remoteSystem: string): MaybePromise<Array<FileDependencyDownload | DirectoryDependencyDownload>>;
}

export class DummyDependencyDownloader implements DependencyDownloadService {
    downloadDependencies(remoteSystem: string): Array<FileDependencyDownload | DirectoryDependencyDownload> {
        return [];
    }
}
