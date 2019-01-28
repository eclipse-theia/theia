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
import { IProcessExitEvent, ProcessErrorEvent } from './process';
import { isWindows } from '@theia/core/lib/common/os';

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
        const error = await new Promise<ProcessErrorEvent>((resolve, reject) => {
            const proc = terminalProcessFactory({ command: '/non-existent' });
            proc.onStart(reject);
            proc.onError(resolve);
        });

        expect(error.code).eq('ENOENT');
    });

    it('test error on trying to execute a directory', async function () {
        const error = await new Promise<ProcessErrorEvent>((resolve, reject) => {
            const proc = terminalProcessFactory({ command: __dirname });
            proc.onStart(reject);
            proc.onError(resolve);
        });

        if (isWindows) {
            // On Windows, node-pty returns us a "File not found" message, so we can't really differentiate this case
            // from trying to execute a non-existent file.  node's child_process.spawn also returns ENOENT, so it's
            // probably the best we can get.
            expect(error.code).eq('ENOENT');
        } else {
            expect(error.code).eq('EACCES');
        }
    });

    it('test exit', async function () {
        const args = ['--version'];
        const exit = await new Promise<IProcessExitEvent>((resolve, reject) => {
            const proc = terminalProcessFactory({ command: process.execPath, 'args': args });
            proc.onExit(resolve);
            proc.onError(reject);
        });

        expect(exit.code).eq(0);
    });

    it('test pipe stream', async function () {
        const v = await new Promise<string>((resolve, reject) => {
            const args = ['--version'];
            const terminalProcess = terminalProcessFactory({ command: process.execPath, 'args': args });
            terminalProcess.onError(reject);
            const outStream = new stream.PassThrough();

            terminalProcess.createOutputStream().pipe(outStream);

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

        /* Avoid using equal since terminal characters can be inserted at the end.  */
        expect(v).to.have.string(process.version);
    });
});
