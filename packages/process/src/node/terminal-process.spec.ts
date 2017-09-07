/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as chai from 'chai';
import 'mocha';
import * as chaiAsPromised from 'chai-as-promised'
import * as process from 'process';
import * as stream from 'stream';
import { testContainer } from './inversify.spec-config';
import { TerminalProcessFactory } from './terminal-process';
import { isWindows } from "@theia/core/lib/common";

chai.use(chaiAsPromised);

/**
 * Globals
 */

const expect = chai.expect;

describe('TerminalProcess', function () {

    const terminalProcessFactory = testContainer.get<TerminalProcessFactory>(TerminalProcessFactory);

    it('test error on non existent path', function () {

        /* FIXME need to pass empty options because of issue #115 in node-pty
        this should be fixed in next release of node-pty */

        /* Strangly linux returns exited with code 1 when using a non existant path but windows throws an error.
        This would need to be investigated more.  */
        if (isWindows) {
            return expect(() => terminalProcessFactory({ command: '/non-existent', options: {} })).to.throw();
        } else {
            const terminalProcess = terminalProcessFactory({ command: '/non-existant', options: {} });
            const p = new Promise(resolve => {
                terminalProcess.onExit(event => {
                    if (event.code > 0) { resolve(); }
                    terminalProcess.dispose();
                });
            });

            return expect(p).to.be.eventually.fulfilled;
        }
    });

    it('test exit', function () {
        const args = ['--version'];
        const terminalProcess = terminalProcessFactory({ command: process.execPath, 'args': args, options: {} });
        const p = new Promise((resolve, reject) => {
            terminalProcess.onError(error => {
                reject();
                terminalProcess.dispose();
            });
            terminalProcess.onExit(event => {
                /* FIXME windows has not exit code  because of issue #75 in node-pty
                this should be fixed in next release of node-pty */
                if (isWindows) {
                    resolve();
                } else {
                    if (event.code === 0) {
                        resolve();
                    } else {
                        reject();
                    }
                }
                terminalProcess.dispose();
            });
        });

        return expect(p).to.be.eventually.fulfilled;
    });

    it('test dispose', function () {
        const terminalProcess = terminalProcessFactory({ command: process.execPath, options: {} });
        const p = new Promise((resolve, reject) => {
            terminalProcess.dispose();
            terminalProcess.onExit(event => resolve());
        });
        return expect(p).to.be.eventually.fulfilled;
    });

    it('test pipe stream', function () {
        const args = ['--version'];
        const terminalProcess = terminalProcessFactory({ command: process.execPath, 'args': args, options: {} });

        const outStream = new stream.PassThrough();

        const p = new Promise<String>((resolve, reject) => {
            let version = '';
            outStream.on('data', data => {
                version += data.toString();
            });
            /* node-pty is not sending 'end' on the stream as it quits
            only 'exit' is sent on the terminal process.  */
            terminalProcess.onExit(() => {
                resolve(version.trim())
                terminalProcess.dispose();
            });
        });

        terminalProcess.output.pipe(outStream);

        /* Avoid using equal since terminal characters can be inserted at the end.  */
        return expect(p).to.eventually.have.string(process.version);
    });
});
