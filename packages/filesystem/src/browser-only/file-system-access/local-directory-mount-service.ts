// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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

import { Event, Path, URI } from '@theia/core';
import { FileSystemAccessPermissionState } from './file-system-access-types.js';
import { LocalDirectoryFileSystemProvider } from './local-directory-file-system-provider.js';

export const LocalDirectoryMountService = Symbol('LocalDirectoryMountService');

/**
 * Keeps track of the local directories that the user granted access to through the File System Access API
 * and mounts each of them at `<rootUri>/<name>`.
 */
export interface LocalDirectoryMountService {
    /** Resolves once the mounts of previous sessions have been restored. */
    readonly ready: Promise<void>;
    readonly onDidChangeMounts: Event<void>;
    /** The `file:` URI below which the local directories are mounted. */
    readonly rootUri: URI;

    isSupported(): boolean;
    /**
     * Shows the native directory picker and mounts the picked directory.
     * Must be called from a user gesture.
     * @returns the `file:` URI of the mount root, or `undefined` if the user cancelled the picker.
     */
    pickAndMount(): Promise<URI | undefined>;
    getMount(name: string): LocalDirectoryMount | undefined;
    getMounts(): LocalDirectoryMount[];
    /** Returns the URI of the mount with the given name, whether it exists or not. */
    toUri(name: string): URI;
    /** Locates `uri` inside of a mount, or returns `undefined` if it is not below {@link rootUri}. */
    getMountPath(uri: URI): LocalDirectoryMountPath | undefined;
    unmount(name: string): Promise<void>;
    /**
     * Asks the user to grant read/write access again, e.g. after a reload.
     * Must be called from a user gesture.
     */
    requestAccess(name: string): Promise<boolean>;
}

export interface LocalDirectoryMount {
    /** The name of the mount, i.e. the path segment below {@link LocalDirectoryMountService.rootUri}. */
    readonly name: string;
    readonly handle: FileSystemDirectoryHandle;
    readonly uri: URI;
    readonly provider: LocalDirectoryFileSystemProvider;
    permission: FileSystemAccessPermissionState;
}

export interface LocalDirectoryMountPath {
    /** The name of the mount. */
    readonly name: string;
    /** The path inside of the mount, empty for the root of the mount. */
    readonly relative: Path;
}

export namespace LocalDirectoryMount {
    /**
     * The default path below which local directories are mounted in the `file` scheme.
     * The OPFS shares that scheme and whatever it stores at this path is shadowed, hence the unusual name.
     */
    export const DEFAULT_ROOT = '/.local-folders';

    /**
     * Splits `path` into the mount name and the path inside the mount,
     * e.g. `a` and `src/index.ts` for `<root>/a/src/index.ts`.
     */
    export function splitPath(root: Path, path: Path): LocalDirectoryMountPath | undefined {
        const relative = root.relative(path.normalize());
        if (!relative || relative.toString() === '') {
            return undefined;
        }
        let top = relative;
        while (top.hasDir) {
            top = top.dir;
        }
        return { name: top.toString(), relative: top.relative(relative) ?? new Path('') };
    }
}
