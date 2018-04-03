/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import * as process from 'process';
import * as stream from 'stream';
import { testContainer } from './inversify.spec-config';
import { RawProcessFactory } from './raw-process';
import * as tmp from 'tmp';
import * as fs from 'fs';
import { isWindows } from '@theia/core';

describe('RawProcess', () => {
    const rawProcessFactory = testContainer.get<RawProcessFactory>(RawProcessFactory);

    test('test error on non-existent path', async () => {
        const p = new Promise((resolve, reject) => {
            const rawProcess = rawProcessFactory({ command: '/non-existent' });
            rawProcess.onError(error => {
                // tslint:disable-next-line:no-any
                const code = (error as any).code;
                resolve(code);
            });
        });

        await expect(p).resolves.toEqual('ENOENT');
    });

    test('test error on non-executable path', async () => {
        /* Create a non-executable file.  */
        const f = tmp.fileSync({ prefix: 'non-executable-' });
        fs.writeSync(f.fd, 'echo bob');

        /* Make really sure it's non-executable.  */
        let mode = fs.fstatSync(f.fd).mode;
        mode &= ~fs.constants.S_IXUSR;
        mode &= ~fs.constants.S_IXGRP;
        mode &= ~fs.constants.S_IXOTH;
        fs.fchmodSync(f.fd, mode);

        fs.closeSync(f.fd);

        const p = new Promise((resolve, reject) => {
            const rawProcess = rawProcessFactory({ command: f.name });
            rawProcess.onError(error => {
                // tslint:disable-next-line:no-any
                const code = (error as any).code;
                resolve(code);
            });
        });

        /* On Windows, we get 'UNKNOWN'.  */
        let expectedCode = 'EACCES';
        if (isWindows) {
            expectedCode = 'UNKNOWN';
        }

        await expect(p).resolves.toEqual(expectedCode);
    });

    test('test exit', async () => {
        const args = ['--version'];
        const rawProcess = rawProcessFactory({ command: process.execPath, 'args': args });
        const p = new Promise((resolve, reject) => {
            rawProcess.onError(error => {
                reject();
            });

            rawProcess.onExit(event => {
                if (event.code > 0) {
                    reject();
                } else {
                    resolve();
                }
            });
        });

        await expect(p).resolves.toBeUndefined();
    });

    test('test pipe stdout stream', async () => {
        const args = ['--version'];
        const rawProcess = rawProcessFactory({ command: process.execPath, 'args': args });

        const outStream = new stream.PassThrough();

        const p = new Promise<string>((resolve, reject) => {
            let version = '';
            outStream.on('data', data => {
                version += data.toString();
            });
            outStream.on('end', () => {
                resolve(version.trim());
            });
        });

        rawProcess.output.pipe(outStream);

        await expect(p).resolves.toEqual(process.version);
    });

    test('test pipe stderr stream', async () => {
        const args = ['invalidarg'];
        const rawProcess = rawProcessFactory({ command: process.execPath, 'args': args });

        const outStream = new stream.PassThrough();

        const p = new Promise<string>((resolve, reject) => {
            let version = '';
            outStream.on('data', data => {
                version += data.toString();
            });
            outStream.on('end', () => {
                resolve(version.trim());
            });
        });

        rawProcess.errorOutput.pipe(outStream);

        await expect(p).resolves.toContain('Error');
    });
});
