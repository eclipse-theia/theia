/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import 'mocha';
import * as chaiAsPromised from 'chai-as-promised';
import * as process from 'process';
import * as stream from 'stream';
import { testContainer } from './inversify.spec-config';
import { RawProcessFactory } from './raw-process';

chai.use(chaiAsPromised);

/**
 * Globals
 */

const expect = chai.expect;

describe('RawProcess', function () {

    this.timeout(5000);
    const rawProcessFactory = testContainer.get<RawProcessFactory>(RawProcessFactory);

    it('test error on non existent path', function () {
        const rawProcess = rawProcessFactory({ command: '/non-existant' });
        const p = new Promise(resolve => {
            rawProcess.onError(error => {
                resolve();
            });
        });

        return expect(p).to.be.eventually.fulfilled;
    });

    it('test exit', function () {
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

        return expect(p).to.be.eventually.fulfilled;
    });

    it('test pipe stdout stream', function () {
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

        return expect(p).to.be.eventually.equal(process.version);
    });

    it('test pipe stderr stream', function () {
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

        return expect(p).to.be.eventually.have.string('Error');
    });
});
