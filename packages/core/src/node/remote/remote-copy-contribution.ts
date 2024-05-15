// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { MaybePromise } from '../../common/types';

export const RemoteCopyContribution = Symbol('RemoteCopyContribution');

export interface RemoteCopyContribution {
    copy(registry: RemoteCopyRegistry): MaybePromise<void>
}

export interface RemoteCopyOptions {
    /**
     * The mode that the file should be set to once copied to the remote.
     *
     * Only relevant for POSIX-like systems
     */
    mode?: number;
}

export interface RemoteFile {
    path: string
    target: string
    options?: RemoteCopyOptions;
}

export interface RemoteCopyRegistry {
    getFiles(): RemoteFile[];
    glob(pattern: string, target?: string): Promise<void>;
    file(file: string, target?: string, options?: RemoteCopyOptions): void;
    directory(dir: string, target?: string): Promise<void>;
}
