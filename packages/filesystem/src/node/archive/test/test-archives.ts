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

import { crc32, gzipSync } from 'zlib';
import * as tarStream from 'tar-stream';

export interface TestZipEntry {
    name: string;
    /** The Unix mode including the file type bits, e.g. `0o100644` for a file or `0o120777` for a symlink. */
    mode?: number;
    data?: string | Uint8Array;
}

/**
 * Builds a zip archive with stored entries. Unlike archiving libraries, it writes names and modes as given,
 * so that it can produce the hostile archives the extractor has to handle.
 */
export function createTestZip(entries: TestZipEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name, 'utf8');
        const data = typeof entry.data === 'string' || entry.data === undefined ? Buffer.from(entry.data ?? '', 'utf8') : Buffer.from(entry.data);
        const checksum = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0x21, 12);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, name, data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        // Made by Unix, so that the upper 16 bits of the external attributes hold the mode.
        central.writeUInt16LE((3 << 8) | 20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, name);

        offset += local.length + name.length + data.length;
    }
    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, centralDirectory, end]);
}

export interface TestTarEntry {
    name: string;
    type?: 'file' | 'directory' | 'symlink' | 'link' | 'fifo';
    mode?: number;
    linkname?: string;
    data?: string | Uint8Array;
}

export async function createTestTar(entries: TestTarEntry[], gzip = false): Promise<Buffer> {
    const pack = tarStream.pack();
    const chunks: Buffer[] = [];
    const collected = (async () => {
        for await (const chunk of pack) {
            chunks.push(chunk as Buffer);
        }
    })();
    for (const entry of entries) {
        const type = entry.type ?? 'file';
        await new Promise<void>((resolve, reject) => {
            const header = { name: entry.name, type, mode: entry.mode, linkname: entry.linkname };
            pack.entry(header, entry.data ?? '', error => error ? reject(error) : resolve());
        });
    }
    pack.finalize();
    await collected;
    const tar = Buffer.concat(chunks);
    return gzip ? gzipSync(tar) : tar;
}
