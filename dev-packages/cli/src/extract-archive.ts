// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

// Follows the rules of `ArchiveExtractorImpl` in `@theia/filesystem`, which the CLI cannot depend on:
// an entry that is absolute or leaves the destination fails the extraction, and links and special
// entries are skipped rather than created.

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import * as yauzl from 'yauzl';
import * as tarStream from 'tar-stream';

export type ArchiveFormat = 'zip' | 'tgz';

export interface ArchiveFile {
    /** The path of the file relative to the root of the archive, using `/` as separator. */
    path: string;
    data: Buffer;
}

interface ArchiveEntry {
    name: string;
    kind: 'file' | 'directory' | 'unsupported';
    mode?: number;
    /** Opens the content of a file entry. Entries that are not opened are discarded. */
    open(): Promise<Readable>;
}

// Existing links are rejected before a file is opened; `O_NOFOLLOW` additionally guards against a link created in between
// where the platform supports it, which Windows does not.
const WRITE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW ?? 0);

/**
 * Extracts an archive into the destination directory, creating it if needed.
 */
export async function extractArchive(archive: Uint8Array, destination: string, format: ArchiveFormat): Promise<void> {
    await fs.promises.mkdir(destination, { recursive: true });
    const root = await fs.promises.realpath(destination);
    const verifiedDirectories = new Set<string>([root]);
    const skipped: string[] = [];
    await readEntries(archive, format, async entry => {
        const entryPath = toEntryPath(entry.name);
        if (!entryPath) {
            return;
        }
        if (entry.kind === 'unsupported') {
            skipped.push(entryPath);
            return;
        }
        const target = path.join(root, ...entryPath.split('/'));
        if (entry.kind === 'directory') {
            await createDirectory(root, target, verifiedDirectories);
        } else {
            await createDirectory(root, path.dirname(target), verifiedDirectories);
            await assertNoLink(root, target);
            const handle = await fs.promises.open(target, WRITE_FLAGS, entry.mode ?? 0o666);
            await pipeline(await entry.open(), handle.createWriteStream());
        }
    });
    reportSkipped(skipped);
}

/**
 * Reads the content of all files in an archive without writing anything to disk.
 */
export async function readArchiveFiles(archive: Uint8Array, format: ArchiveFormat): Promise<ArchiveFile[]> {
    const files: ArchiveFile[] = [];
    const skipped: string[] = [];
    await readEntries(archive, format, async entry => {
        const entryPath = toEntryPath(entry.name);
        if (entryPath && entry.kind === 'unsupported') {
            skipped.push(entryPath);
        }
        if (!entryPath || entry.kind !== 'file') {
            return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of await entry.open()) {
            chunks.push(chunk);
        }
        files.push({ path: entryPath, data: Buffer.concat(chunks) });
    });
    reportSkipped(skipped);
    return files;
}

async function readEntries(archive: Uint8Array, format: ArchiveFormat, visit: (entry: ArchiveEntry) => Promise<void>): Promise<void> {
    if (format === 'zip') {
        const zipFile = await yauzl.fromBufferPromise(Buffer.from(archive));
        for await (const entry of zipFile.eachEntry()) {
            // The upper 16 bits hold the Unix mode if the archive was created on a Unix system, and are 0 otherwise.
            const unixMode = entry.externalFileAttributes >>> 16;
            const fileType = unixMode & 0o170000;
            const kind = entry.fileName.endsWith('/') || fileType === 0o040000 ? 'directory'
                : fileType === 0 || fileType === 0o100000 ? 'file' : 'unsupported';
            await visit({ name: entry.fileName, kind, mode: toMode(unixMode), open: () => zipFile.openReadStreamPromise(entry) });
        }
        return;
    }
    const input = Readable.from([Buffer.from(archive)]);
    const extract = tarStream.extract();
    // Resolves with the error instead of rejecting, so that a failure is not unhandled while entries are visited.
    const feeding = pipeline(input, createGunzip(), extract as unknown as NodeJS.WritableStream).then(() => undefined, (reason: unknown) => reason);
    try {
        for await (const entry of extract) {
            const type = entry.header.type;
            const kind = type === 'file' || type === 'contiguous-file' ? 'file' : type === 'directory' ? 'directory' : 'unsupported';
            let consumed = false;
            await visit({
                name: entry.header.name,
                kind,
                mode: toMode(entry.header.mode),
                open: async () => {
                    consumed = true;
                    // Entries are not Node streams: Node's `pipeline` would wait forever for an entry that a failing archive
                    // already destroyed, while a stream created from the entry fails.
                    return Readable.from(entry);
                }
            });
            if (!consumed) {
                entry.resume();
            }
        }
    } catch (error) {
        input.destroy();
        await feeding;
        throw error;
    }
    const feedError = await feeding;
    if (feedError) {
        throw feedError;
    }
}

function toEntryPath(name: string): string | undefined {
    const normalized = name.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
        throw new Error(`Archive entry has an absolute path: ${name}`);
    }
    const segments = normalized.split('/').filter(segment => segment && segment !== '.');
    if (segments.includes('..')) {
        throw new Error(`Archive entry leaves the extraction directory: ${name}`);
    }
    return segments.length > 0 ? segments.join('/') : undefined;
}

function toMode(mode: number | undefined): number | undefined {
    // Keep the permission bits only, without the setuid, setgid and sticky bits.
    return ((mode ?? 0) & 0o777) || undefined;
}

async function createDirectory(root: string, directory: string, verifiedDirectories: Set<string>): Promise<void> {
    // Create one segment at a time and refuse to descend into a link that already existed in the destination.
    let current = root;
    for (const segment of path.relative(root, directory).split(path.sep)) {
        current = path.join(current, segment);
        if (verifiedDirectories.has(current)) {
            continue;
        }
        try {
            await fs.promises.mkdir(current);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
            if (!(await fs.promises.lstat(current)).isDirectory()) {
                throw new Error(`Archive entry leaves the extraction directory: ${path.relative(root, current)}`);
            }
        }
        verifiedDirectories.add(current);
    }
}

async function assertNoLink(root: string, target: string): Promise<void> {
    const existing = await fs.promises.lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    });
    if (existing && !existing.isFile()) {
        throw new Error(`Archive entry would be written through a link or special file: ${path.relative(root, target)}`);
    }
}

function reportSkipped(skipped: string[]): void {
    if (skipped.length > 0) {
        console.warn(`Skipped ${skipped.length} link or special entries of archive: ${skipped.join(', ')}`);
    }
}
