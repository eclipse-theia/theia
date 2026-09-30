// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Event, URI } from '@theia/core';
import { FileSystemAccessPermissionState } from './file-system-access-types';
import { LocalDirectoryFileSystemProvider } from './local-directory-file-system-provider';

export const LocalDirectoryMountService = Symbol('LocalDirectoryMountService');

/**
 * Keeps track of the local directories that the user granted access to through the File System Access API
 * and mounts each of them at `file:///local/<name>`.
 */
export interface LocalDirectoryMountService {
    /** Resolves once the mounts of previous sessions have been restored. */
    readonly ready: Promise<void>;
    readonly onDidChangeMounts: Event<void>;

    isSupported(): boolean;
    /**
     * Shows the native directory picker and mounts the picked directory.
     * Must be called from a user gesture.
     * @returns the `file:` URI of the mount root, or `undefined` if the user cancelled the picker.
     */
    pickAndMount(): Promise<URI | undefined>;
    getMount(name: string): LocalDirectoryMount | undefined;
    getMounts(): LocalDirectoryMount[];
    unmount(name: string): Promise<void>;
    /**
     * Asks the user to grant read/write access again, e.g. after a reload.
     * Must be called from a user gesture.
     */
    requestAccess(name: string): Promise<boolean>;
}

export interface LocalDirectoryMount {
    /** The name of the mount, i.e. the path segment below {@link LocalDirectoryMount.ROOT}. */
    readonly name: string;
    readonly handle: FileSystemDirectoryHandle;
    readonly uri: URI;
    readonly provider: LocalDirectoryFileSystemProvider;
    permission: FileSystemAccessPermissionState;
}

export namespace LocalDirectoryMount {
    /** The path below which local directories are mounted in the `file` scheme. */
    export const ROOT = '/local';

    export function rootUri(): URI {
        return new URI('file://' + ROOT);
    }

    export function toUri(name: string): URI {
        return rootUri().resolve(name);
    }

    /** Returns the mount name of the given URI, or `undefined` if it is not located in a mount. */
    export function getMountName(uri: URI): string | undefined {
        if (uri.scheme !== 'file') {
            return undefined;
        }
        const segments = uri.path.toString().split('/').filter(segment => segment.length > 0);
        return segments.length >= 2 && '/' + segments[0] === ROOT ? segments[1] : undefined;
    }
}
