// *****************************************************************************
// Copyright (C) 2026 Ehab Younes and others.
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

import * as path from 'path';
import * as fs from 'fs';
import { isOSX, isWindows } from '@theia/core';
import { WatcherLogger } from '../filesystem-watcher';

export type WatchEventListener = (eventType: string, fileName: string | null) => void;

/** Enough of a directory to tell a replacement from the original. */
export interface DirectoryIdentity {
    readonly dev: number;
    readonly ino: number;
    readonly birthtimeMs: number;
}

/** Where a requested path is watched, and what the path itself resolves to. */
export interface WatchTarget {
    /** Directory to open a handle on. */
    readonly directory: string;
    /** The requested path resolved: `directory` itself, or one file inside it. */
    readonly realPath: string;
}

/** Every file system and platform rule a watcher needs, in one place a test can substitute. */
export class WatcherHost {

    private statFailureReported = false;

    constructor(protected readonly logger: WatcherLogger) { }

    /** Windows and macOS resolve names irrespective of case. */
    get caseInsensitiveFileNames(): boolean {
        return isWindows || isOSX;
    }

    /** macOS crashes on watching a network share (microsoft/vscode#106879). */
    isUnsupportedTarget(fsPath: string): boolean {
        return isOSX && (fsPath === '/Volumes' || fsPath.startsWith('/Volumes/'));
    }

    /**
     * A file is watched through its parent, which also keeps one that is deleted and recreated observable. A
     * path that does not exist yet is taken for a directory. Real paths are resolved because macOS FSEvents
     * reports them and libuv drops what it cannot match.
     */
    async resolveTarget(fsPath: string): Promise<WatchTarget> {
        const realPath = await fs.promises.realpath(fsPath).catch(() => fsPath);
        const stat = await fs.promises.stat(realPath).catch(() => undefined);
        return { directory: stat && !stat.isDirectory() ? path.dirname(realPath) : realPath, realPath };
    }

    watch(directory: string, listener: WatchEventListener): fs.FSWatcher {
        return fs.watch(directory, { recursive: false }, listener);
    }

    async readChildren(directory: string): Promise<Set<string>> {
        const children = await fs.promises.readdir(directory).catch(() => []);
        return new Set(children.map(fileName => this.normalizeFileName(fileName)));
    }

    /** The identity of a directory, or `undefined` if the path is missing or not a directory. */
    async readIdentity(directory: string): Promise<DirectoryIdentity | undefined> {
        const stat = await fs.promises.stat(directory).catch(() => undefined);
        // The inode number alone is not enough: deleting a directory frees it for its replacement.
        return stat?.isDirectory() ? { dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs } : undefined;
    }

    /**
     * Looks up the stored name of children, for several names at one moment. Where names ignore case, it reads the
     * directory once, as `stat` would hide a `foo.txt` to `Foo.txt` rename.
     */
    childLookup(directory: string): (fileName: string) => Promise<string | undefined> {
        if (!this.caseInsensitiveFileNames) {
            return async fileName => await this.exists(path.resolve(directory, fileName)) ? fileName : undefined;
        }
        let stored: Promise<{ names: Set<string>, byKey: Map<string, string> }> | undefined;
        return async fileName => {
            const { names, byKey } = await (stored ??= this.readChildren(directory)
                .then(children => ({ names: children, byKey: new Map(Array.from(children, child => [this.pathKey(child), child])) })));
            return names.has(fileName) ? fileName : byKey.get(this.pathKey(fileName));
        };
    }

    exists(fsPath: string): Promise<boolean> {
        return fs.promises.stat(fsPath).then(() => true, error => {
            // Only ENOENT and ENOTDIR mean missing. EACCES or ELOOP can turn into a spurious deletion and creation, so log them.
            if (!['ENOENT', 'ENOTDIR'].includes(error?.code) && !this.statFailureReported) {
                this.statFailureReported = true;
                this.logger.error(`Watcher cannot tell whether "${fsPath}" exists, treating it as missing:`, error);
            }
            return false;
        });
    }

    /** macOS reports decomposed names, which would not match a composed path a client asked to watch. */
    normalizeFileName(fileName: string): string {
        return isOSX ? fileName.normalize('NFC') : fileName;
    }

    /** The form in which the host compares paths. A path read from the disk can be decomposed on macOS. */
    pathKey(fsPath: string): string {
        const normalized = this.normalizeFileName(fsPath);
        return this.caseInsensitiveFileNames ? normalized.toLowerCase() : normalized;
    }

    samePath(expected: string, actual: string): boolean {
        return this.pathKey(expected) === this.pathKey(actual);
    }
}
