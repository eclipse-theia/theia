/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/platform/files/common/io.ts

/* eslint-disable max-len */

import URI from '@theia/core/lib/common/uri';
import { BinaryBuffer } from '@theia/core/lib/common//buffer';
import { CancellationToken, cancelled as canceled } from '@theia/core/lib/common/cancellation';
import { FileSystemProviderWithOpenReadWriteCloseCapability, FileReadStreamOptions, ensureFileSystemProviderError, createFileSystemProviderError, FileSystemProviderErrorCode } from './files';
import { WriteableStream, ErrorTransformer, DataTransformer } from '@theia/core/lib/common/stream';

export interface CreateReadStreamOptions extends FileReadStreamOptions {

	/**
	 * The size of the buffer to use before sending to the stream.
	 */
    bufferSize: number;

	/**
	 * Allows to massage any possibly error that happens during reading.
	 */
    errorTransformer?: ErrorTransformer;
}

/**
 * A helper to read a file from a provider with open/read/close capability into a stream.
 */
export async function readFileIntoStream<T>(
    provider: FileSystemProviderWithOpenReadWriteCloseCapability,
    resource: URI,
    target: WriteableStream<T>,
    transformer: DataTransformer<BinaryBuffer, T>,
    options: CreateReadStreamOptions,
    token: CancellationToken
): Promise<void> {
    let error: Error | undefined = undefined;

    try {
        await doReadFileIntoStream(provider, resource, target, transformer, options, token);
    } catch (err) {
        error = err;
    } finally {
        if (error && options.errorTransformer) {
            error = options.errorTransformer(error);
        }

        target.end(error);
    }
}

async function doReadFileIntoStream<T>(provider: FileSystemProviderWithOpenReadWriteCloseCapability, resource: URI, target: WriteableStream<T>, transformer: DataTransformer<BinaryBuffer, T>, options: CreateReadStreamOptions, token: CancellationToken): Promise<void> {

    // Check for cancellation
    throwIfCancelled(token);

    // open handle through provider
    const handle = await provider.open(resource, { create: false });

    // Check for cancellation
    throwIfCancelled(token);

    try {
        let totalBytesRead = 0;
        let bytesRead = 0;
        let allowedRemainingBytes = (options && typeof options.length === 'number') ? options.length : undefined;

        let buffer = BinaryBuffer.alloc(Math.min(options.bufferSize, typeof allowedRemainingBytes === 'number' ? allowedRemainingBytes : options.bufferSize));

        let posInFile = options && typeof options.position === 'number' ? options.position : 0;
        let posInBuffer = 0;
        do {
            // read from source (handle) at current position (pos) into buffer (buffer) at
            // buffer position (posInBuffer) up to the size of the buffer (buffer.byteLength).
            bytesRead = await provider.read(handle, posInFile, buffer.buffer, posInBuffer, buffer.byteLength - posInBuffer);

            posInFile += bytesRead;
            posInBuffer += bytesRead;
            totalBytesRead += bytesRead;

            if (typeof allowedRemainingBytes === 'number') {
                allowedRemainingBytes -= bytesRead;
            }

            // when buffer full, create a new one and emit it through stream
            if (posInBuffer === buffer.byteLength) {
                await target.write(transformer(buffer));

                buffer = BinaryBuffer.alloc(Math.min(options.bufferSize, typeof allowedRemainingBytes === 'number' ? allowedRemainingBytes : options.bufferSize));

                posInBuffer = 0;
            }
        } while (bytesRead > 0 && (typeof allowedRemainingBytes !== 'number' || allowedRemainingBytes > 0) && throwIfCancelled(token) && throwIfTooLarge(totalBytesRead, options));

        // wrap up with last buffer (also respect maxBytes if provided)
        if (posInBuffer > 0) {
            let lastChunkLength = posInBuffer;
            if (typeof allowedRemainingBytes === 'number') {
                lastChunkLength = Math.min(posInBuffer, allowedRemainingBytes);
            }

            target.write(transformer(buffer.slice(0, lastChunkLength)));
        }
    } catch (error) {
        throw ensureFileSystemProviderError(error);
    } finally {
        await provider.close(handle);
    }
}

function throwIfCancelled(token: CancellationToken): boolean {
    if (token.isCancellationRequested) {
        throw canceled();
    }

    return true;
}

function throwIfTooLarge(totalBytesRead: number, options: CreateReadStreamOptions): boolean {

    // Return early if file is too large to load and we have configured limits
    if (options?.limits) {
        if (typeof options.limits.memory === 'number' && totalBytesRead > options.limits.memory) {
            throw createFileSystemProviderError('To open a file of this size, you need to restart and allow it to use more memory', FileSystemProviderErrorCode.FileExceedsMemoryLimit);
        }

        if (typeof options.limits.size === 'number' && totalBytesRead > options.limits.size) {
            throw createFileSystemProviderError('File is too large to open', FileSystemProviderErrorCode.FileTooLarge);
        }
    }

    return true;
}
