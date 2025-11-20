// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { isObject, type URI } from '@theia/core/lib/common';

export interface FileDownloadData {
    readonly uris: string[];
}

export namespace FileDownloadData {
    export function is(arg: unknown): arg is FileDownloadData {
        return isObject(arg) && 'uris' in arg;
    }
}

export namespace FileDownloadService {
    export interface DownloadOptions {
        // `true` if the download link has to be copied to the clipboard. This will not trigger the actual download. Defaults to `false`.
        readonly copyLink?: boolean;
    }
}

export const FileDownloadService = Symbol('FileDownloadService');

export interface FileDownloadService {
    download(uris: URI[], options?: FileDownloadService.DownloadOptions): Promise<void>;
}
