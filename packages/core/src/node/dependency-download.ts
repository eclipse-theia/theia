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

export const dependencyDownloadContribution = Symbol('dependencyDownloadContribution');

export interface DependencyDownloadContribution {
    httpOptions?: RequestOptions;

    getDownloadUrl(remoteOS: string): MaybePromise<string>;

    onDownloadCompleted?(file: URI, err?: Error): void;
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
