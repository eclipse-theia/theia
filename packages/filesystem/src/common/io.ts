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
import { BinaryBuffer, BinaryBufferWriteableStream, BinaryBufferReadableStream } from '@theia/core/lib/common//buffer';
import { CancellationToken, cancelled as canceled } from '@theia/core/lib/common/cancellation';
import { FileSystemProviderWithOpenReadWriteCloseCapability, FileReadStreamOptions, ensureFileSystemProviderError } from './files';

export interface CreateReadStreamOptions extends FileReadStreamOptions {

	/**
	 * The size of the buffer to use before sending to the stream.
	 */
    bufferSize: number;
}

export function createReadStream(provider: FileSystemProviderWithOpenReadWriteCloseCapability, resource: URI, options: CreateReadStreamOptions, token?: CancellationToken): BinaryBufferReadableStream {
    const stream = BinaryBufferWriteableStream.create();

    // do not await reading but simply return the stream directly since it operates
    // via events. finally end the stream and send through the possible error

    doReadFileIntoStream(provider, resource, stream, options, token).then(() => stream.end(), error => stream.end(error));

    return stream;
}

async function doReadFileIntoStream(provider: FileSystemProviderWithOpenReadWriteCloseCapability, resource: URI, stream: BinaryBufferWriteableStream, options: CreateReadStreamOptions, token?: CancellationToken): Promise<void> {

    // Check for cancellation
    throwIfCancelled(token);

    // open handle through provider
    const handle = await provider.open(resource, { create: false });

    // Check for cancellation
    throwIfCancelled(token);

    try {
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

            if (typeof allowedRemainingBytes === 'number') {
                allowedRemainingBytes -= bytesRead;
            }

            // when buffer full, create a new one and emit it through stream
            if (posInBuffer === buffer.byteLength) {
                stream.write(buffer);

                buffer = BinaryBuffer.alloc(Math.min(options.bufferSize, typeof allowedRemainingBytes === 'number' ? allowedRemainingBytes : options.bufferSize));

                posInBuffer = 0;
            }
        } while (bytesRead > 0 && (typeof allowedRemainingBytes !== 'number' || allowedRemainingBytes > 0) && throwIfCancelled(token));

        // wrap up with last buffer (also respect maxBytes if provided)
        if (posInBuffer > 0) {
            let lastChunkLength = posInBuffer;
            if (typeof allowedRemainingBytes === 'number') {
                lastChunkLength = Math.min(posInBuffer, allowedRemainingBytes);
            }

            stream.write(buffer.slice(0, lastChunkLength));
        }
    } catch (error) {
        throw ensureFileSystemProviderError(error);
    } finally {
        await provider.close(handle);
    }
}

function throwIfCancelled(token?: CancellationToken): boolean {
    if (token && token.isCancellationRequested) {
        throw canceled();
    }

    return true;
}
