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
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/workbench/services/textfile/common/encoding.ts

/* eslint-disable no-null/no-null */

import * as iconv from 'iconv-lite';
import { Buffer } from 'safer-buffer';
import { injectable } from 'inversify';
import { BinaryBuffer, BinaryBufferReadableStream, BinaryBufferReadable } from './buffer';
import { UTF8, UTF8_with_bom, UTF16be, UTF16le, UTF16be_BOM, UTF16le_BOM, UTF8_BOM } from './encodings';
import { newWriteableStream, ReadableStream, Readable } from './stream';

const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512; 	// number of bytes to look at to decide about a file being binary or not
const NO_ENCODING_GUESS_MIN_BYTES = 512; 			// when not auto guessing the encoding, small number of bytes are enough
const AUTO_ENCODING_GUESS_MIN_BYTES = 512 * 8; 		// with auto guessing we want a lot more content to be read for guessing
const AUTO_ENCODING_GUESS_MAX_BYTES = 512 * 128; 	// set an upper limit for the number of bytes we pass on to jschardet

// we explicitly ignore a specific set of encodings from auto guessing
// - ASCII: we never want this encoding (most UTF-8 files would happily detect as
//          ASCII files and then you could not type non-ASCII characters anymore)
// - UTF-16: we have our own detection logic for UTF-16
// - UTF-32: we do not support this encoding in VSCode
const IGNORE_ENCODINGS = ['ascii', 'utf-16', 'utf-32'];

export interface ResourceEncoding {
    encoding: string
    hasBOM: boolean
}

export interface DetectedEncoding {
    encoding?: string
    seemsBinary?: boolean
}

export interface DecodeStreamOptions {
    guessEncoding?: boolean;
    minBytesRequiredForDetection?: number;

    overwriteEncoding(detectedEncoding: string | undefined): Promise<string>;
}
export interface DecodeStreamResult {
    stream: ReadableStream<string>;
    detected: DetectedEncoding;
}

@injectable()
export class EncodingService {

    encode(value: string, options?: ResourceEncoding): BinaryBuffer {
        let encoding = options?.encoding;
        const addBOM = options?.hasBOM;
        encoding = this.toIconvEncoding(encoding);
        if (encoding === UTF8 && !addBOM) {
            return BinaryBuffer.fromString(value);
        }
        const buffer = iconv.encode(value, encoding, { addBOM });
        return BinaryBuffer.wrap(buffer);
    }

    decode(value: BinaryBuffer, encoding?: string): string {
        const buffer = Buffer.from(value.buffer);
        encoding = this.toIconvEncoding(encoding);
        return iconv.decode(buffer, encoding);
    }

    exists(encoding: string): boolean {
        encoding = this.toIconvEncoding(encoding);
        return iconv.encodingExists(encoding);
    }

    toIconvEncoding(encoding?: string): string {
        if (encoding === UTF8_with_bom || !encoding) {
            return UTF8; // iconv does not distinguish UTF 8 with or without BOM, so we need to help it
        }
        return encoding;
    }

    async toResourceEncoding(encoding: string, options: {
        overwriteEncoding?: boolean,
        read: (length: number) => Promise<Uint8Array>
    }): Promise<ResourceEncoding> {
        // Some encodings come with a BOM automatically
        if (encoding === UTF16be || encoding === UTF16le || encoding === UTF8_with_bom) {
            return { encoding, hasBOM: true };
        }

        // Ensure that we preserve an existing BOM if found for UTF8
        // unless we are instructed to overwrite the encoding
        const overwriteEncoding = options?.overwriteEncoding;
        if (!overwriteEncoding && encoding === UTF8) {
            try {
                // stream here to avoid fetching the whole content on write
                const buffer = await options.read(UTF8_BOM.length);
                if (this.detectEncodingByBOMFromBuffer(Buffer.from(buffer), buffer.byteLength) === UTF8_with_bom) {
                    return { encoding, hasBOM: true };
                }
            } catch (error) {
                // ignore - file might not exist
            }
        }

        return { encoding, hasBOM: false };
    }

    async detectEncoding(data: BinaryBuffer, autoGuessEncoding?: boolean): Promise<DetectedEncoding> {
        const buffer = Buffer.from(data.buffer);
        const bytesRead = data.byteLength;
        // Always first check for BOM to find out about encoding
        let encoding = this.detectEncodingByBOMFromBuffer(buffer, bytesRead);

        // Detect 0 bytes to see if file is binary or UTF-16 LE/BEÏ
        // unless we already know that this file has a UTF-16 encoding
        let seemsBinary = false;
        if (encoding !== UTF16be && encoding !== UTF16le && buffer) {
            let couldBeUTF16LE = true; // e.g. 0xAA 0x00
            let couldBeUTF16BE = true; // e.g. 0x00 0xAA
            let containsZeroByte = false;

            // This is a simplified guess to detect UTF-16 BE or LE by just checking if
            // the first 512 bytes have the 0-byte at a specific location. For UTF-16 LE
            // this would be the odd byte index and for UTF-16 BE the even one.
            // Note: this can produce false positives (a binary file that uses a 2-byte
            // encoding of the same format as UTF-16) and false negatives (a UTF-16 file
            // that is using 4 bytes to encode a character).
            for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
                const isEndian = (i % 2 === 1); // assume 2-byte sequences typical for UTF-16
                const isZeroByte = (buffer.readUInt8(i) === 0);

                if (isZeroByte) {
                    containsZeroByte = true;
                }

                // UTF-16 LE: expect e.g. 0xAA 0x00
                if (couldBeUTF16LE && (isEndian && !isZeroByte || !isEndian && isZeroByte)) {
                    couldBeUTF16LE = false;
                }

                // UTF-16 BE: expect e.g. 0x00 0xAA
                if (couldBeUTF16BE && (isEndian && isZeroByte || !isEndian && !isZeroByte)) {
                    couldBeUTF16BE = false;
                }

                // Return if this is neither UTF16-LE nor UTF16-BE and thus treat as binary
                if (isZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
                    break;
                }
            }

            // Handle case of 0-byte included
            if (containsZeroByte) {
                if (couldBeUTF16LE) {
                    encoding = UTF16le;
                } else if (couldBeUTF16BE) {
                    encoding = UTF16be;
                } else {
                    seemsBinary = true;
                }
            }
        }

        // Auto guess encoding if configured
        if (autoGuessEncoding && !seemsBinary && !encoding && buffer) {
            const guessedEncoding = await this.guessEncodingByBuffer(buffer.slice(0, bytesRead));
            return {
                seemsBinary: false,
                encoding: guessedEncoding
            };
        }

        return { seemsBinary, encoding };
    }

    protected detectEncodingByBOMFromBuffer(buffer: Buffer, bytesRead: number): typeof UTF8_with_bom | typeof UTF16le | typeof UTF16be | undefined {
        if (!buffer || bytesRead < UTF16be_BOM.length) {
            return undefined;
        }

        const b0 = buffer.readUInt8(0);
        const b1 = buffer.readUInt8(1);

        // UTF-16 BE
        if (b0 === UTF16be_BOM[0] && b1 === UTF16be_BOM[1]) {
            return UTF16be;
        }

        // UTF-16 LE
        if (b0 === UTF16le_BOM[0] && b1 === UTF16le_BOM[1]) {
            return UTF16le;
        }

        if (bytesRead < UTF8_BOM.length) {
            return undefined;
        }

        const b2 = buffer.readUInt8(2);

        // UTF-8
        if (b0 === UTF8_BOM[0] && b1 === UTF8_BOM[1] && b2 === UTF8_BOM[2]) {
            return UTF8_with_bom;
        }

        return undefined;
    }

    protected async guessEncodingByBuffer(buffer: Buffer): Promise<string | undefined> {
        const jschardet = await import('jschardet');

        const guessed = jschardet.detect(buffer.slice(0, AUTO_ENCODING_GUESS_MAX_BYTES)); // ensure to limit buffer for guessing due to https://github.com/aadsm/jschardet/issues/53
        if (!guessed || !guessed.encoding) {
            return undefined;
        }

        const enc = guessed.encoding.toLowerCase();
        if (0 <= IGNORE_ENCODINGS.indexOf(enc)) {
            return undefined; // see comment above why we ignore some encodings
        }

        return this.toIconvEncoding(guessed.encoding);
    }

    decodeStream(source: BinaryBufferReadableStream, options: DecodeStreamOptions): Promise<DecodeStreamResult> {
        const minBytesRequiredForDetection = options.minBytesRequiredForDetection ?? options.guessEncoding ? AUTO_ENCODING_GUESS_MIN_BYTES : NO_ENCODING_GUESS_MIN_BYTES;

        return new Promise<DecodeStreamResult>((resolve, reject) => {
            const target = newWriteableStream<string>(strings => strings.join(''));

            const bufferedChunks: BinaryBuffer[] = [];
            let bytesBuffered = 0;

            let decoder: iconv.DecoderStream | undefined = undefined;

            const createDecoder = async () => {
                try {

                    // detect encoding from buffer
                    const detected = await this.detectEncoding(BinaryBuffer.concat(bufferedChunks), options.guessEncoding);

                    // ensure to respect overwrite of encoding
                    detected.encoding = await options.overwriteEncoding(detected.encoding);

                    // decode and write buffered content
                    decoder = iconv.getDecoder(this.toIconvEncoding(detected.encoding));
                    const decoded = decoder.write(Buffer.from(BinaryBuffer.concat(bufferedChunks).buffer));
                    target.write(decoded);

                    bufferedChunks.length = 0;
                    bytesBuffered = 0;

                    // signal to the outside our detected encoding and final decoder stream
                    resolve({
                        stream: target,
                        detected
                    });
                } catch (error) {
                    reject(error);
                }
            };

            // Stream error: forward to target
            source.on('error', error => target.error(error));

            // Stream data
            source.on('data', async chunk => {

                // if the decoder is ready, we just write directly
                if (decoder) {
                    target.write(decoder.write(Buffer.from(chunk.buffer)));
                } else {
                    bufferedChunks.push(chunk);
                    bytesBuffered += chunk.byteLength;

                    // buffered enough data for encoding detection, create stream
                    if (bytesBuffered >= minBytesRequiredForDetection) {

                        // pause stream here until the decoder is ready
                        source.pause();

                        await createDecoder();

                        // resume stream now that decoder is ready but
                        // outside of this stack to reduce recursion
                        setTimeout(() => source.resume());
                    }
                }
            });

            // Stream end
            source.on('end', async () => {

                // we were still waiting for data to do the encoding
                // detection. thus, wrap up starting the stream even
                // without all the data to get things going
                if (!decoder) {
                    await createDecoder();
                }

                // end the target with the remainders of the decoder
                target.end(decoder?.end());
            });
        });
    }

    encodeStream(value: string | Readable<string>, options?: ResourceEncoding): Promise<BinaryBuffer | BinaryBufferReadable>
    encodeStream(value?: string | Readable<string>, options?: ResourceEncoding): Promise<BinaryBuffer | BinaryBufferReadable | undefined>;
    async encodeStream(value: string | Readable<string> | undefined, options?: ResourceEncoding): Promise<BinaryBuffer | BinaryBufferReadable | undefined> {
        let encoding = options?.encoding;
        const addBOM = options?.hasBOM;
        encoding = this.toIconvEncoding(encoding);
        if (encoding === UTF8 && !addBOM) {
            return value === undefined ? undefined : typeof value === 'string' ?
                BinaryBuffer.fromString(value) : BinaryBufferReadable.fromReadable(value);
        }

        value = value || '';
        const readable = typeof value === 'string' ? Readable.fromString(value) : value;
        const encoder = iconv.getEncoder(encoding, { addBOM });

        let bytesWritten = false;
        let done = false;

        return {
            read(): BinaryBuffer | null {
                if (done) {
                    return null;
                }

                const chunk = readable.read();
                if (typeof chunk !== 'string') {
                    done = true;

                    // If we are instructed to add a BOM but we detect that no
                    // bytes have been written, we must ensure to return the BOM
                    // ourselves so that we comply with the contract.
                    if (!bytesWritten && addBOM) {
                        switch (encoding) {
                            case UTF8:
                            case UTF8_with_bom:
                                return BinaryBuffer.wrap(Uint8Array.from(UTF8_BOM));
                            case UTF16be:
                                return BinaryBuffer.wrap(Uint8Array.from(UTF16be_BOM));
                            case UTF16le:
                                return BinaryBuffer.wrap(Uint8Array.from(UTF16le_BOM));
                        }
                    }

                    const leftovers = encoder.end();
                    if (leftovers && leftovers.length > 0) {
                        bytesWritten = true;
                        return BinaryBuffer.wrap(leftovers);
                    }

                    return null;
                }

                bytesWritten = true;

                return BinaryBuffer.wrap(encoder.write(chunk));
            }
        };
    }

}
