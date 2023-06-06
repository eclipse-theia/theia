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

import { RequestOptions } from 'https';
import { MaybePromise, URI } from 'src/common';


/**
 * contribution used for downloading prebuild nativ dependency when connecting to a remote machine with a different system
 */
export interface DependencyDownloadContribution {
    httpOptions?: RequestOptions;
    skipUnzip?: boolean

    getDownloadUrl(remoteOS: string): MaybePromise<string>;

    onDownloadCompleted?(file: URI, err?: Error): void;
}

export namespace DependencyDownloadContribution {
    export const Contribution = Symbol('dependencyDownloadContribution');

    const DEFAULT_DEPENDENCY_DOWNLOAD_URL = 'https://github.com/jonah-iden/theia-native-dependencies/releases/download/1.38.0-';
    export const DEFAULT_WIN_DEPENDENCY_URL = DEFAULT_DEPENDENCY_DOWNLOAD_URL + 'windows-latest';
    export const DEFAULT_MAC_DEPENDENCY_URL = DEFAULT_DEPENDENCY_DOWNLOAD_URL + 'mac-latest';
    export const DEFAULT_LINUX_DEPENDENCY_URL = DEFAULT_DEPENDENCY_DOWNLOAD_URL + 'ubuntu-latest';

    export function getDefaultURLForFile(fileName: string, remoteOS: string): string {
        if (remoteOS.includes('darwin')) {
            return `${DEFAULT_MAC_DEPENDENCY_URL}/${fileName}`;
        } else if (remoteOS.includes('win')) {
            return `${DEFAULT_WIN_DEPENDENCY_URL}/${fileName}`;
        } else {
            return `${DEFAULT_LINUX_DEPENDENCY_URL}/${fileName}`;
        }

    }

}


export const DependencyDownloadService = Symbol('dependencyDownloadService');
/**
 * used by the "@theia/remote" package to donwload nativ dependencies for the remote system;
 */
export interface DependencyDownloadService {

    /**
     * downloads natvie dependencies for copying on a remote machine
     * @param remoteOS the operating system of the remote machine in format "{platform}-{architecure}"" e.g. "win32-x64"
     */
    downloadDependencies(remoteOS: string): MaybePromise<string>;
}

export class DummyDependencyDownloader implements DependencyDownloadService {
    downloadDependencies(remoteOS: string): string {
        return '';
    }
}
