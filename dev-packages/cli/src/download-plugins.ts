/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs';
import * as http from 'http';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import * as process from 'process';
import * as request from 'requestretry';
import * as stream from 'stream';
import * as tar from 'tar';
import * as zlib from 'zlib';

import { green, red, bold } from 'colors/safe';

import { promisify } from 'util';
const mkdirpAsPromised = promisify<string, mkdirp.Made>(mkdirp);

const unzip = require('unzip-stream');

type RetryResponse = http.IncomingMessage & { attempts: number };

/**
 * Available options when downloading.
 */
export interface DownloadPluginsOptions {
    /**
     * Determines if a plugin should be unpacked.
     * Defaults to `false`.
     */
    packed?: boolean;
}

export default async function downloadPlugins(options: DownloadPluginsOptions = {}): Promise<void> {
    const {
        packed = false,
    } = options;

    console.log('--- downloading plugins ---');

    // Resolve the `package.json` at the current working directory.
    const pck = require(path.resolve(process.cwd(), 'package.json'));

    // Resolve the directory for which to download the plugins.
    const pluginsDir = pck.theiaPluginsDir || 'plugins';

    await mkdirpAsPromised(pluginsDir);

    await Promise.all(Object.keys(pck.theiaPlugins).map(async plugin => {
        if (!plugin) {
            return;
        }
        const pluginUrl = pck.theiaPlugins[plugin];

        let fileExt: string;
        if (pluginUrl.endsWith('tar.gz')) {
            fileExt = '.tar.gz';
        } else if (pluginUrl.endsWith('vsix')) {
            fileExt = '.vsix';
        } else {
            console.error(bold(red(`error: '${plugin}' has an unsupported file type: '${pluginUrl}'`)));
            return;
        }

        const targetPath = path.join(process.cwd(), pluginsDir, `${plugin}${packed === true ? fileExt : ''}`);

        // Skip plugins which have previously been downloaded.
        if (isDownloaded(targetPath)) {
            console.log('- ' + plugin + ': already downloaded - skipping');
            return;
        }

        // requestretry makes our life difficult: it supposedly hands back a readable stream,
        // but if we try to use it later it will be too late and somehow the stream will already
        // be consumed. Since we cannot handle said stream later, we'll buffer it to be able
        // to replay it once we know everything went ok with the download.
        const bufferingStream = new BufferingStream();

        let download!: { res: RetryResponse, body: string };
        try {
            download = await new Promise<typeof download>((resolve, reject) => {
                const req = request({
                    ...pck.requestOptions,
                    url: pluginUrl,
                    maxAttempts: 5,
                    retryDelay: 2000,
                    retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
                }, (err: any, _res: any, body: string) => {
                    const res: RetryResponse = _res;
                    if (err) {
                        reject({ res, err });
                    } else {
                        if (typeof res.statusCode !== 'number' || res.statusCode < 200 || res.statusCode > 299) {
                            reject({ res, err });
                        } else {
                            resolve({ res, body });
                        }
                    }
                });
                // Buffer the stream right away:
                req.pipe(bufferingStream);
            });
        } catch (object) {
            const { err, res } = object as { err?: Error, res?: RetryResponse };
            const status: string = res ? buildStatusStr(res.statusCode, res.statusMessage) : '';
            console.error(bold(red(`x ${plugin}: failed to download ${res && res.attempts > 1 ? `(after ${res.attempts} attempts)` : ''} ${status}`)));
            if (err) {
                console.error(err);
            }
            return;
        }

        console.log(green(`+ ${plugin}: downloaded successfully ${download.res.attempts > 1 ? `(after ${download.res.attempts} attempts)` : ''}`));

        // Get ready to re-stream downloaded data:
        const replayStream = bufferingStream.replay();

        if (fileExt === '.tar.gz') {
            // Decompress .tar.gz files.
            await mkdirpAsPromised(targetPath);
            const gunzip = zlib.createGunzip({
                finishFlush: zlib.Z_SYNC_FLUSH,
                flush: zlib.Z_SYNC_FLUSH
            });
            const untar = tar.x({ cwd: targetPath });
            replayStream.pipe(gunzip).pipe(untar);
        } else {
            if (packed === true) {
                // Download .vsix without decompressing.
                const file = fs.createWriteStream(targetPath);
                replayStream.pipe(file);
            } else {
                // Decompress .vsix.
                replayStream.pipe(unzip.Extract({ path: targetPath }));
            }
        }

        await new Promise((resolve, reject) => {
            replayStream.on('end', resolve);
            replayStream.on('error', reject);
        });
    }));
}

/**
 * Determine if the resource for the given path is already downloaded.
 * @param filePath the resource path.
 *
 * @returns `true` if the resource is already downloaded, else `false`.
 */
function isDownloaded(filePath: string): boolean {
    return fs.existsSync(filePath);
}

/**
 * Build a human-readable message about the response.
 * @param code the status code of the response.
 * @param message the status message of the response.
 */
function buildStatusStr(code: number | undefined, message: string | undefined): string {
    if (code && message) {
        return `{ statusCode: ${code}, statusMessage: ${message} }`;
    } else if (code && !message) {
        return `{ statusCode: ${code} }`;
    } else if (!code && message) {
        return `{ statusMessage: ${message} }`;
    } else {
        return '';
    }
}

/**
 * Stores everything you write into it.
 * You can then create a new readable stream based on the buffered data.'
 * When getting the replay stream, the current instance will be invalidated.
 */
class BufferingStream extends stream.Writable {

    protected _buffer: Buffer = Buffer.alloc(0);
    protected _replay: ReplayStream | undefined;

    replay(): ReplayStream {
        if (typeof this._replay === 'undefined') {
            this._replay = new ReplayStream(this._buffer);
        }
        return this._replay;
    }

    _write(chunk: Buffer | string, encoding: any, callback: Function): void {
        if (typeof this._replay !== 'undefined') {
            callback(new Error('unexpected write: replay is ongoing'));
            return;
        }
        let data: Buffer;
        if (typeof chunk === 'string' && Buffer.isEncoding(encoding)) {
            data = Buffer.from(chunk, encoding);
        } else if (Buffer.isBuffer(chunk)) {
            data = chunk;
        } else {
            callback(new TypeError('cannot get a buffer from chunk'));
            return;
        }
        this._buffer = Buffer.concat([this._buffer, data], this._buffer.length + data.length);
        // eslint-disable-next-line no-null/no-null
        callback(null);
    }

}

/**
 * Stream the content of a buffer.
 */
class ReplayStream extends stream.Readable {

    protected _buffer: Buffer;
    protected _head = 0;

    constructor(buffer: Buffer) {
        super();
        this._buffer = buffer;
    }

    _read(size: number): void {
        if (this._head > this._buffer.length - 1) {
            // eslint-disable-next-line no-null/no-null
            this.push(null); // end.
        } else {
            const chunk = this._buffer.slice(this._head, this._head + size);
            this._head += size;
            this.push(chunk);
        }
    }

}
