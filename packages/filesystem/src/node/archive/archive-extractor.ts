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

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import * as yauzl from 'yauzl';
import * as tarStream from 'tar-stream';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';

export type ArchiveFormat = 'zip' | 'tar' | 'tgz';

/** The path of an archive on disk, or the content of an archive. */
export type ArchiveSource = string | Uint8Array;

export interface ArchiveOptions {
    /** The format of the archive. Detected from its content if omitted. */
    format?: ArchiveFormat;
}

export interface ArchiveReadOptions extends ArchiveOptions {
    /** Selects the files to read by their path in the archive. All files are read if omitted. */
    filter?: (entryPath: string) => boolean;
}

export interface ArchiveEntry {
    /** The path of the entry relative to the root of the archive, using `/` as separator. */
    path: string;
    type: 'file' | 'directory';
    /** The permission bits of the entry, without the setuid, setgid and sticky bits. */
    mode?: number;
}

export interface ArchiveFile extends ArchiveEntry {
    type: 'file';
    data: Buffer;
}

export const ArchiveExtractor = Symbol('ArchiveExtractor');
/**
 * Extracts zip, tar and gzipped tar archives.
 *
 * Archives are treated as untrusted: an entry whose path is absolute or leaves the archive root fails the
 * extraction, and links and other special entries are skipped rather than created, so that nothing can be
 * written or exposed outside of the destination.
 */
export interface ArchiveExtractor {
    /**
     * Extracts the archive into the destination directory, creating it if needed.
     * @returns the extracted files and directories.
     */
    extract(source: ArchiveSource, destination: string, options?: ArchiveOptions): Promise<ArchiveEntry[]>;
    /**
     * Reads the content of the files in the archive without writing anything to disk.
     */
    readFiles(source: ArchiveSource, options?: ArchiveReadOptions): Promise<ArchiveFile[]>;
}

/** An entry as reported by the reader of an archive format, before its path is validated. */
interface RawArchiveEntry {
    name: string;
    kind: 'file' | 'directory' | 'unsupported';
    mode?: number;
    /** Opens the content of a file entry. Entries that are not opened are discarded. */
    open(): Promise<Readable>;
}

type RawArchiveEntryVisitor = (entry: RawArchiveEntry) => Promise<void>;

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const PERMISSION_BITS = 0o777;

/**
 * Existing links are rejected before a file is opened; `O_NOFOLLOW` additionally guards against a link created in between
 * where the platform supports it, which Windows does not.
 */
const WRITE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW ?? 0);

@injectable()
export class ArchiveExtractorImpl implements ArchiveExtractor {

    /** Not available to instances created without dependency injection, which report skipped entries on the console. */
    @inject(ILogger) @named('filesystem:ArchiveExtractorImpl')
    protected readonly logger?: ILogger;

    async extract(source: ArchiveSource, destination: string, options: ArchiveOptions = {}): Promise<ArchiveEntry[]> {
        await fs.promises.mkdir(destination, { recursive: true });
        const root = await fs.promises.realpath(destination);
        const verifiedDirectories = new Set<string>([root]);
        const entries: ArchiveEntry[] = [];
        const skipped: string[] = [];
        await this.readEntries(source, options.format, async entry => {
            const entryPath = this.toEntryPath(entry.name);
            if (!entryPath) {
                return;
            }
            if (entry.kind === 'unsupported') {
                skipped.push(entryPath);
                return;
            }
            const target = path.join(root, ...entryPath.split('/'));
            if (entry.kind === 'directory') {
                await this.createDirectory(root, target, verifiedDirectories);
                entries.push({ path: entryPath, type: 'directory', mode: entry.mode });
            } else {
                await this.createDirectory(root, path.dirname(target), verifiedDirectories);
                await this.assertNoLink(root, target);
                await this.writeFile(target, await entry.open(), entry.mode);
                entries.push({ path: entryPath, type: 'file', mode: entry.mode });
            }
        });
        this.reportSkipped(source, skipped);
        return entries;
    }

    async readFiles(source: ArchiveSource, options: ArchiveReadOptions = {}): Promise<ArchiveFile[]> {
        const files: ArchiveFile[] = [];
        const skipped: string[] = [];
        await this.readEntries(source, options.format, async entry => {
            const entryPath = this.toEntryPath(entry.name);
            if (entryPath && entry.kind === 'unsupported') {
                skipped.push(entryPath);
            }
            if (!entryPath || entry.kind !== 'file' || (options.filter && !options.filter(entryPath))) {
                return;
            }
            const chunks: Buffer[] = [];
            for await (const chunk of await entry.open()) {
                chunks.push(chunk);
            }
            files.push({ path: entryPath, type: 'file', mode: entry.mode, data: Buffer.concat(chunks) });
        });
        this.reportSkipped(source, skipped);
        return files;
    }

    protected async readEntries(source: ArchiveSource, format: ArchiveFormat | undefined, visit: RawArchiveEntryVisitor): Promise<void> {
        switch (format ?? await this.detectFormat(source)) {
            case 'zip':
                return this.readZipEntries(source, visit);
            case 'tar':
                return this.readTarEntries(source, false, visit);
            case 'tgz':
                return this.readTarEntries(source, true, visit);
        }
    }

    /**
     * Detects the format of an archive from its first bytes.
     */
    protected async detectFormat(source: ArchiveSource): Promise<ArchiveFormat> {
        const header = await this.readHeader(source, 512);
        if (header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b && ((header[2] === 0x03 && header[3] === 0x04) || (header[2] === 0x05 && header[3] === 0x06))) {
            return 'zip';
        }
        if (header.length >= 2 && header[0] === 0x1f && header[1] === 0x8b) {
            return 'tgz';
        }
        if (header.length >= 262 && header.toString('latin1', 257, 262) === 'ustar') {
            return 'tar';
        }
        throw new Error(`Unsupported archive format${typeof source === 'string' ? `: ${source}` : ''}`);
    }

    protected async readHeader(source: ArchiveSource, length: number): Promise<Buffer> {
        if (typeof source !== 'string') {
            return Buffer.from(source.subarray(0, length));
        }
        const handle = await fs.promises.open(source, 'r');
        try {
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buffer, 0, length, 0);
            return buffer.subarray(0, bytesRead);
        } finally {
            await handle.close();
        }
    }

    protected async readZipEntries(source: ArchiveSource, visit: RawArchiveEntryVisitor): Promise<void> {
        const zipFile = typeof source === 'string'
            ? await yauzl.openPromise(source)
            : await yauzl.fromBufferPromise(Buffer.from(source));
        try {
            for await (const entry of zipFile.eachEntry()) {
                // The upper 16 bits hold the Unix mode if the archive was created on a Unix system, and are 0 otherwise.
                const unixMode = entry.externalFileAttributes >>> 16;
                const fileType = unixMode & S_IFMT;
                let kind: RawArchiveEntry['kind'];
                if (entry.fileName.endsWith('/') || fileType === S_IFDIR) {
                    kind = 'directory';
                } else if (fileType === 0 || fileType === S_IFREG) {
                    kind = 'file';
                } else {
                    kind = 'unsupported';
                }
                await visit({
                    name: entry.fileName,
                    kind,
                    mode: this.toMode(unixMode),
                    open: () => zipFile.openReadStreamPromise(entry)
                });
            }
        } finally {
            if (zipFile.isOpen) {
                zipFile.close();
            }
        }
    }

    protected async readTarEntries(source: ArchiveSource, gzipped: boolean, visit: RawArchiveEntryVisitor): Promise<void> {
        const input = typeof source === 'string' ? fs.createReadStream(source) : Readable.from([Buffer.from(source)]);
        const extract = tarStream.extract();
        const streams: NodeJS.ReadWriteStream[] = gzipped ? [createGunzip()] : [];
        // Resolves with the error instead of rejecting, so that a failure is not unhandled while entries are visited.
        const feeding = pipeline([input, ...streams, extract as unknown as NodeJS.WritableStream]).then(() => undefined, (reason: unknown) => reason);
        try {
            for await (const entry of extract) {
                const header = entry.header;
                let kind: RawArchiveEntry['kind'];
                if (header.type === 'file' || header.type === 'contiguous-file') {
                    kind = 'file';
                } else if (header.type === 'directory') {
                    kind = 'directory';
                } else {
                    kind = 'unsupported';
                }
                let consumed = false;
                await visit({
                    name: header.name,
                    kind,
                    mode: this.toMode(header.mode),
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

    /**
     * Normalizes the name of an entry to a relative path with `/` as separator.
     * @returns `undefined` for the archive root.
     * @throws if the name is absolute or leaves the archive root.
     */
    protected toEntryPath(name: string): string | undefined {
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

    protected toMode(mode: number | undefined): number | undefined {
        const permissions = (mode ?? 0) & PERMISSION_BITS;
        return permissions || undefined;
    }

    /**
     * Creates a directory below the root one segment at a time and refuses to descend into an existing entry that is not
     * a directory, so that nothing is created or written through a link that already existed in the destination.
     */
    protected async createDirectory(root: string, directory: string, verifiedDirectories: Set<string>): Promise<void> {
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

    /**
     * Rejects writing a file over an existing link or special file, which could point outside of the destination.
     */
    protected async assertNoLink(root: string, target: string): Promise<void> {
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

    protected async writeFile(target: string, content: Readable, mode: number | undefined): Promise<void> {
        const handle = await fs.promises.open(target, WRITE_FLAGS, mode ?? 0o666);
        await pipeline(content, handle.createWriteStream());
    }

    protected reportSkipped(source: ArchiveSource, skipped: string[]): void {
        if (skipped.length > 0) {
            const message = `Skipped ${skipped.length} link or special entries of archive${typeof source === 'string' ? ` ${source}` : ''}: ${skipped.join(', ')}`;
            if (this.logger) {
                this.logger.warn(message);
            } else {
                // eslint-disable-next-line @theia/named-logger-check
                console.warn(message);
            }
        }
    }
}
