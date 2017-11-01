/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as stream from 'stream';
import * as chaiAsPromised from 'chai-as-promised'

import { testContainer } from './test/inversify.spec-config';
import { RipGrepProcessFactory, RipGrepWorkSpace } from './ripgrep-workspace';

const expect = chai.expect;
let ripgrepWorkSpace: RipGrepWorkSpace;
const ripgrepProcessFactory = testContainer.get<RipGrepProcessFactory>(RipGrepProcessFactory);
chai.use(chaiAsPromised);

describe("ripgrep-workspace", function () {
    it('test basic option', function () {
        ripgrepWorkSpace = ripgrepProcessFactory({ 'args': ['--version'] });
        const outStream = new stream.PassThrough();
        const p = new Promise<String>((resolve, reject) => {
            let buffer = '';
            outStream.on('data', data => {
                buffer += data.toString();
            });
            outStream.on('end', () => {
                resolve(buffer);
            });
            ripgrepWorkSpace.onExit(() => {
                resolve(buffer)
            });
        });
        ripgrepWorkSpace.output.pipe(outStream);
        return expect(p).to.eventually.include("ripgrep");

    });
    it('test basic grep', function () {
        {
            ripgrepWorkSpace = ripgrepProcessFactory({ 'args': ['theia *'] });
            const outStream = new stream.PassThrough();
            const p = new Promise<String>((resolve, reject) => {
                let buffer = '';
                outStream.on('data', data => {
                    buffer += data.toString();
                });
                outStream.on('end', () => {
                    resolve(buffer);
                });
                ripgrepWorkSpace.onExit(() => {
                    resolve(buffer)
                });
            });
            ripgrepWorkSpace.output.pipe(outStream);
            return expect(p).to.eventually.include("theia");
        };
    });
});
