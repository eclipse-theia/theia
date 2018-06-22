/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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
import * as chai from 'chai';
import * as process from 'process';
import * as stream from 'stream';
import { createProcessTestContainer } from './test/process-test-container';
import { TerminalProcessFactory } from './terminal-process';
import { isWindows } from "@theia/core/lib/common";

/**
 * Globals
 */

const expect = chai.expect;

describe('TerminalProcess', function () {

    this.timeout(5000);
    let terminalProcessFactory: TerminalProcessFactory;

    beforeEach(() => {
        terminalProcessFactory = createProcessTestContainer().get<TerminalProcessFactory>(TerminalProcessFactory);
    });

    it('test error on non existent path', async function () {

        /* Strangely, Linux returns exited with code 1 when using a non existing path but Windows throws an error.
        This would need to be investigated more.  */
        if (isWindows) {
            return expect(() => terminalProcessFactory({ command: '/non-existent' })).to.throw();
        } else {
            const terminalProcess = terminalProcessFactory({ command: '/non-existant' });
            const p = new Promise(resolve => {
                terminalProcess.onExit(event => {
                    if (event.code > 0) { resolve(); }
                });
            });

            await p;
        }
    });

    it('test exit', async function () {
        const args = ['--version'];
        const terminalProcess = terminalProcessFactory({ command: process.execPath, 'args': args });
        const p = new Promise((resolve, reject) => {
            terminalProcess.onError(error => {
                reject();
            });
            terminalProcess.onExit(event => {
                if (event.code === 0) {
                    resolve();
                } else {
                    reject();
                }
            });
        });

        await p;
    });

    it('test pipe stream', async function () {
        const args = ['--version'];
        const terminalProcess = terminalProcessFactory({ command: process.execPath, 'args': args });

        const outStream = new stream.PassThrough();

        const p = new Promise<string>((resolve, reject) => {
            let version = '';
            outStream.on('data', data => {
                version += data.toString();
            });
            /* node-pty is not sending 'end' on the stream as it quits
            only 'exit' is sent on the terminal process.  */
            terminalProcess.onExit(() => {
                resolve(version.trim());
            });
        });

        terminalProcess.createOutputStream().pipe(outStream);

        /* Avoid using equal since terminal characters can be inserted at the end.  */
        expect(await p).to.have.string(process.version);
    });
});
