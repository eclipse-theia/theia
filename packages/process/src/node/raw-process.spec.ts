/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import * as process from 'process';
import * as stream from 'stream';
import { testContainer } from './inversify.spec-config';
import { RawProcessFactory } from './raw-process';
import * as temp from 'temp';
import * as fs from 'fs';
import { isWindows } from '@theia/core';

/* Allow to create temporary files, but delete them when we're done.  */
const track = temp.track();

/**
 * Globals
 */

const expect = chai.expect;

describe('RawProcess', function () {

    this.timeout(5000);
    const rawProcessFactory = testContainer.get<RawProcessFactory>(RawProcessFactory);

    it('test error on non-existent path', async function () {
        const p = new Promise((resolve, reject) => {
            const rawProcess = rawProcessFactory({ command: '/non-existent' });
            rawProcess.onError(error => {
                // tslint:disable-next-line:no-any
                const code = (error as any).code;
                resolve(code);
            });
        });

        expect(await p).to.be.equal('ENOENT');
    });

    it('test error on non-executable path', async function () {
        /* Create a non-executable file.  */
        const f = track.openSync('non-executable');
        fs.writeSync(f.fd, 'echo bob');

        /* Make really sure it's non-executable.  */
        let mode = fs.fstatSync(f.fd).mode;
        mode &= ~fs.constants.S_IXUSR;
        mode &= ~fs.constants.S_IXGRP;
        mode &= ~fs.constants.S_IXOTH;
        fs.fchmodSync(f.fd, mode);

        fs.closeSync(f.fd);

        const p = new Promise((resolve, reject) => {
            const rawProcess = rawProcessFactory({ command: f.path });
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

        expect(await p).to.equal(expectedCode);
    });

    it('test exit', async function () {
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

        await p;
    });

    it('test pipe stdout stream', async function () {
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

        expect(await p).to.be.equal(process.version);
    });

    it('test pipe stderr stream', async function () {
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

        expect(await p).to.have.string('Error');
    });
});
