/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { MultiRingBuffer } from './multi-ring-buffer';

describe('MultiRingBuffer', () => {

    test(
        'expect enq and deq a string with unicode characters > 1 byte and no wrap around',
        () => {
            const ringBufferSize = 15;
            const ringBuffer = new MultiRingBuffer({ size: ringBufferSize });
            const buffer = '\u00bd + \u00bc = \u00be';
            const bufferByteLength = Buffer.byteLength(buffer, 'utf8');

            ringBuffer.enq(buffer);
            expect(ringBuffer.size()).toEqual(bufferByteLength);
        }
    );

    test(
        'expect enq and deq a string with unicode characters > 1 byte and wrap around',
        () => {
            const buffer = '\u00bd + \u00bc = \u00be';
            const ringBufferSize = Buffer.byteLength(buffer[buffer.length - 1]);
            const ringBuffer = new MultiRingBuffer({ size: ringBufferSize });

            ringBuffer.enq(buffer);
            expect(ringBuffer.size()).toEqual(ringBufferSize);

            const reader = ringBuffer.getReader();
            const readBuffer = ringBuffer.deq(reader);

            expect(ringBuffer).toBeDefined();
            if (readBuffer !== undefined) {
                expect(readBuffer).toEqual(buffer[buffer.length - 1].toString());
            }
        }
    );

    test('expect enq a string < ring buffer size ', () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        const buffer = "test";

        ringBuffer.enq(buffer);
        expect(ringBuffer.size()).toEqual(buffer.length);
        expect(ringBuffer.empty()).toEqual(false);
        const reader = ringBuffer.getReader();
        expect(ringBuffer.sizeForReader(reader)).toEqual(buffer.length);
        expect(ringBuffer.emptyForReader(reader)).toEqual(false);

    });

    test('expect deq a string < ring buffer size ', () => {
        const ringBuffer = new MultiRingBuffer({ size: 5 });
        const buffer = "test";

        ringBuffer.enq(buffer);
        expect(ringBuffer.size()).toEqual(4);
        const reader = ringBuffer.getReader();
        const readBuffer = ringBuffer.deq(reader);
        expect(ringBuffer.size()).toEqual(4);
        expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        expect(readBuffer).toEqual(buffer);

    });

    test('expect deq a string > ring buffer size ', () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        const buffer = "testabcd";

        ringBuffer.enq(buffer);
        expect(ringBuffer.size()).toEqual(size);
        const reader = ringBuffer.getReader();
        const readBuffer = ringBuffer.deq(reader);
        expect(ringBuffer.size()).toEqual(size);
        expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        expect(readBuffer).toEqual(buffer.substr(buffer.length - size));

    });

    test('expect enq deq enq deq a string > ring buffer size ', () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        const buffer = "12345678";

        for (let i = 0; i < 2; i++) {
            ringBuffer.enq(buffer);
            expect(ringBuffer.size()).toEqual(size);

            const reader = ringBuffer.getReader();
            const readBuffer = ringBuffer.deq(reader);

            expect(ringBuffer.size()).toEqual(size);
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
            expect(readBuffer).toEqual(buffer.substr(buffer.length - size));
        }
    });

    test(
        'expect enq a string == ring buffer size then one > ring buffer size and dequeue them ',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const buffers = ["12345", "12345678"];

            for (const buffer of buffers) {
                ringBuffer.enq(buffer);
                expect(ringBuffer.size()).toEqual(size);
            }
            const reader = ringBuffer.getReader();
            let i = 0;
            for (const _ of buffers) {
                const readBuffer = ringBuffer.deq(reader);
                if (i === 0) {
                    expect(readBuffer).toEqual(buffers[buffers.length - 1].substr(buffers[buffers.length - 1].length - size));
                } else {
                    expect(readBuffer).toEqual(undefined);
                }
                i++;
            }
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        }
    );

    test(
        'expect enq a string == ring buffer size then one < ring buffer size and dequeue them ',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const buffers = ["12345", "123"];

            for (const buffer of buffers) {
                ringBuffer.enq(buffer);
                expect(ringBuffer.size()).toEqual(size);
            }
            const reader = ringBuffer.getReader();
            let i = 0;
            for (const _ of buffers) {
                const readBuffer = ringBuffer.deq(reader);
                if (i === 0) {
                    expect(readBuffer).toEqual("45123");
                } else {
                    expect(readBuffer).toEqual(undefined);
                }
                i++;
            }
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        }
    );

    test(
        'expect enq a string == ring buffer size then one < ring buffer  then one < buffer size and deque ',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const buffers = ["12345", "123", "678"];

            for (const buffer of buffers) {
                ringBuffer.enq(buffer);
                expect(ringBuffer.size()).toEqual(size);
            }
            const reader = ringBuffer.getReader();
            let i = 0;
            for (const _ of buffers) {
                const readBuffer = ringBuffer.deq(reader);
                if (i === 0) {
                    expect(readBuffer).toEqual("23678");
                } else {
                    expect(readBuffer).toEqual(undefined);
                }
                i++;
            }
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        }
    );

    test(
        'expect enq buffer size then enq 1 to dequeue the right value',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const buffers = ["12345", "1"];

            for (const buffer of buffers) {
                ringBuffer.enq(buffer);
                expect(ringBuffer.size()).toEqual(size);
            }
            const reader = ringBuffer.getReader();
            let i = 0;
            for (const _ of buffers) {
                const readBuffer = ringBuffer.deq(reader);
                if (i === 0) {
                    expect(readBuffer).toEqual("23451");
                } else {
                    expect(readBuffer).toEqual(undefined);
                }
                i++;
            }
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        }
    );

    test(
        'expect enq buffer size then enq 1 twice to dequeue the right value',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const buffers = ["12345", "1", "12345", "1"];

            for (const buffer of buffers) {
                ringBuffer.enq(buffer);
                expect(ringBuffer.size()).toEqual(size);
            }
            const reader = ringBuffer.getReader();
            let i = 0;
            for (const _ of buffers) {
                const readBuffer = ringBuffer.deq(reader);
                if (i === 0) {
                    expect(readBuffer).toEqual("23451");
                } else {
                    expect(readBuffer).toEqual(undefined);
                }
                i++;
            }
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        }
    );

    test(
        'expect enq buffer size of various sizes dequeue the right value',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const buffers = ["12345", "123", "678", "12345", "1", "12345", "123", "12", "12", "1", "12", "123", "1234", "12345", "1", "12"];

            for (const buffer of buffers) {
                ringBuffer.enq(buffer);
                expect(ringBuffer.size()).toEqual(size);
            }

            const reader = ringBuffer.getReader();
            let i = 0;
            for (const _ of buffers) {
                const readBuffer = ringBuffer.deq(reader);
                if (i === 0) {
                    expect(readBuffer).toEqual("45112");
                } else {
                    expect(readBuffer).toEqual(undefined);
                }
                i++;
            }
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        }
    );

    test('expect enq buffer sizes < buffer size to dequeue normally', () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        const buffers = ["1", "1"];

        for (const buffer of buffers) {
            ringBuffer.enq(buffer);
        }
        expect(ringBuffer.size()).toEqual(2);
        const reader = ringBuffer.getReader();
        let i = 0;
        for (const _ of buffers) {
            const readBuffer = ringBuffer.deq(reader);
            if (i === 0) {
                expect(readBuffer).toEqual("11");
            } else {
                expect(readBuffer).toEqual(undefined);
            }
            i++;
        }
        expect(ringBuffer.sizeForReader(reader)).toEqual(0);
    });

    test(
        'expect enq buffer size of various sizes dequeue the right value',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const buffers = ["1", "1", "12", "12"];

            for (const buffer of buffers) {
                ringBuffer.enq(buffer);
            }
            expect(ringBuffer.size()).toEqual(size);
            const reader = ringBuffer.getReader();
            let i = 0;
            for (const _ of buffers) {
                const readBuffer = ringBuffer.deq(reader);
                if (i === 0) {
                    expect(readBuffer).toEqual("11212");
                } else {
                    expect(readBuffer).toEqual(undefined);
                }
                i++;
            }
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        }
    );

    test('expect multiple enq and deq to deq the right values', () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        ringBuffer.enq("12345");

        expect(ringBuffer.size()).toEqual(size);
        const reader = ringBuffer.getReader();
        let readBuffer = ringBuffer.deq(reader);
        expect(readBuffer).toEqual("12345");

        ringBuffer.enq("123");
        readBuffer = ringBuffer.deq(reader);
        expect(readBuffer).toEqual("123");

        ringBuffer.enq("12345");
        readBuffer = ringBuffer.deq(reader);
        expect(readBuffer).toEqual("12345");

        expect(ringBuffer.sizeForReader(reader)).toEqual(0);
    });

    test('expect data from stream on enq', async () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        const buffer = "abc";

        const astream = ringBuffer.getStream();
        const p = new Promise(resolve => {
            astream.on('data', (chunk: string) => {
                expect(chunk).toEqual(buffer);
                resolve();
            });
        });
        ringBuffer.enq(buffer);
        await expect(p).resolves.toBeUndefined();
    });

    test('expect data from stream when data is already enqed', async () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        const buffer = "abc";
        ringBuffer.enq(buffer);

        const astream = ringBuffer.getStream();
        const p = new Promise(resolve => {
            astream.on('data', (chunk: string) => {
                expect(chunk).toEqual(buffer);
                resolve();
            });
        });

        await expect(p).resolves.toBeUndefined();
    });

    test(
        'expect disposing of a stream to delete it from the ringbuffer',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const astream = ringBuffer.getStream();
            astream.dispose();
            expect(ringBuffer.streamsSize()).toEqual(0);
            expect(ringBuffer.readersSize()).toEqual(0);
        }
    );

    test(
        'expect disposing of a reader to delete it from the ringbuffer',
        () => {
            const size = 5;
            const ringBuffer = new MultiRingBuffer({ size });
            const reader = ringBuffer.getReader();
            ringBuffer.closeReader(reader);
            expect(ringBuffer.readersSize()).toEqual(0);
        }
    );

    test('expect enq a string in utf8 and get it in hex', () => {
        const ringBuffer = new MultiRingBuffer({ size: 5 });
        const buffer = "test";

        ringBuffer.enq(buffer);
        expect(ringBuffer.size()).toEqual(4);
        const reader = ringBuffer.getReader();
        const readBuffer = ringBuffer.deq(reader, -1, 'hex');
        expect(readBuffer).toEqual("74657374");
    });

    test('expect enq a string in hex and get it in utf8', () => {
        const ringBuffer = new MultiRingBuffer({ size: 5 });
        const buffer = "74657374";

        ringBuffer.enq(buffer, 'hex');
        expect(ringBuffer.size()).toEqual(4);
        const reader = ringBuffer.getReader();
        const readBuffer = ringBuffer.deq(reader);
        expect(readBuffer).toEqual("test");
    });

    test('expect data from stream in hex when enq in uf8', async () => {
        const size = 5;
        const ringBuffer = new MultiRingBuffer({ size });
        const buffer = "test";
        ringBuffer.enq(buffer);

        const astream = ringBuffer.getStream('hex');
        const p = new Promise(resolve => {
            astream.on('data', (chunk: string) => {
                expect(chunk).toEqual("74657374");
                resolve();
            });
        });

        await expect(p).resolves.toBeUndefined();
    });

    test(
        'expect deq a string < ring buffer size with the internal encoding in hex ',
        () => {
            const ringBuffer = new MultiRingBuffer({ size: 5, encoding: 'hex' });
            const buffer = "test";

            ringBuffer.enq(buffer);
            expect(ringBuffer.size()).toEqual(4);
            const reader = ringBuffer.getReader();
            const readBuffer = ringBuffer.deq(reader);
            expect(ringBuffer.size()).toEqual(4);
            expect(ringBuffer.sizeForReader(reader)).toEqual(0);
            expect(readBuffer).toEqual(buffer);

        }
    );

    test(
        'expect the ringbuffer to be empty if we enq an empty string',
        () => {
            const ringBuffer = new MultiRingBuffer({ size: 5 });
            const buffer = "";

            ringBuffer.enq(buffer);
            expect(ringBuffer.size()).toEqual(0);
            expect(ringBuffer.empty()).toEqual(true);
        }
    );

    test('expect an invalid reader count to be zero', () => {
        const ringBuffer = new MultiRingBuffer({ size: 5 });
        expect(ringBuffer.sizeForReader(1)).toEqual(0);
    });

    test('expect an invalid reader to be empty', () => {
        const ringBuffer = new MultiRingBuffer({ size: 5 });
        expect(ringBuffer.emptyForReader(1)).toEqual(true);
    });

    test('expect partially deq a string < ring buffer size ', () => {
        const ringBuffer = new MultiRingBuffer({ size: 5 });
        const buffer = "test";

        ringBuffer.enq(buffer);
        expect(ringBuffer.size()).toEqual(4);
        const reader = ringBuffer.getReader();
        let readBuffer = ringBuffer.deq(reader, 2);
        expect(ringBuffer.size()).toEqual(4);
        expect(ringBuffer.sizeForReader(reader)).toEqual(2);
        expect(readBuffer).toEqual("te");

        readBuffer = ringBuffer.deq(reader, 2);
        expect(ringBuffer.size()).toEqual(4);
        expect(ringBuffer.sizeForReader(reader)).toEqual(0);
        expect(readBuffer).toEqual("st");
    });

    test(
        'expect partially deq a string < ring buffer size then enq and deq again ',
        () => {
            const ringBuffer = new MultiRingBuffer({ size: 5 });
            const buffer = "test";
            const secondBuffer = "abcd";

            ringBuffer.enq(buffer);
            expect(ringBuffer.size()).toEqual(4);
            const reader = ringBuffer.getReader();
            let readBuffer = ringBuffer.deq(reader, 2);
            expect(ringBuffer.size()).toEqual(4);
            expect(ringBuffer.sizeForReader(reader)).toEqual(2);
            expect(readBuffer).toEqual("te");

            ringBuffer.enq(secondBuffer);
            readBuffer = ringBuffer.deq(reader, 4);
            expect(ringBuffer.size()).toEqual(5);
            expect(readBuffer).toEqual("tabc");
            expect(ringBuffer.sizeForReader(reader)).toEqual(1);

        }
    );
});
