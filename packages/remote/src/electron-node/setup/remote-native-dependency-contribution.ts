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

import { isObject } from '@theia/core';
import { RequestOptions } from '@theia/core/shared/@theia/request';
import { RemotePlatform } from '@theia/core/lib/node/remote/remote-cli-contribution';

export interface FileDependencyResult {
    path: string;
    mode?: number;
}

export type DependencyDownload = FileDependencyDownload | DirectoryDependencyDownload;

export interface FileDependencyDownload {
    file: FileDependencyResult
    buffer: Buffer
}

export namespace FileDependencyResult {
    export function is(item: unknown): item is FileDependencyDownload {
        return isObject(item) && 'buffer' in item && 'file' in item;
    }
}

export interface DirectoryDependencyDownload {
    archive: 'tar' | 'zip' | 'tgz'
    buffer: Buffer
}

export namespace DirectoryDependencyDownload {
    export function is(item: unknown): item is DirectoryDependencyDownload {
        return isObject(item) && 'buffer' in item && 'archive' in item;
    }
}

export interface DownloadOptions {
    remotePlatform: RemotePlatform
    theiaVersion: string;
    download: (requestInfo: string | RequestOptions) => Promise<Buffer>
}

export const RemoteNativeDependencyContribution = Symbol('RemoteNativeDependencyContribution');

/**
 * contribution used for downloading prebuild native dependency when connecting to a remote machine with a different system
 */
export interface RemoteNativeDependencyContribution {
    download(options: DownloadOptions): Promise<DependencyDownload>;
}
