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
import { TerminalProcessFactory, TerminalProcess } from './terminal-process';
import { IProcessExitEvent, ProcessErrorEvent } from './process';
import { isWindows } from '@theia/core/lib/common/os';

/**
 * Globals
 */

const expect = chai.expect;

let terminalProcessFactory: TerminalProcessFactory;

beforeEach(() => {
    terminalProcessFactory = createProcessTestContainer().get<TerminalProcessFactory>(TerminalProcessFactory);
});

describe('TerminalProcess', function () {

    this.timeout(20_000);

    it('test error on non existent path', async function () {
        const error = await new Promise<ProcessErrorEvent>((resolve, reject) => {
            const proc = terminalProcessFactory({ command: '/non-existent' });
            proc.onStart(reject);
            proc.onError(resolve);
            proc.onExit(reject);
        });

        expect(error.code).eq('ENOENT');
    });

    it('test error on trying to execute a directory', async function () {
        const error = await new Promise<ProcessErrorEvent>((resolve, reject) => {
            const proc = terminalProcessFactory({ command: __dirname });
            proc.onStart(reject);
            proc.onError(resolve);
            proc.onExit(reject);
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
            const proc = terminalProcessFactory({ command: process.execPath, args });
            proc.onExit(resolve);
            proc.onError(reject);
        });

        expect(exit.code).eq(0);
    });

    it('test pipe stream', async function () {
        const v = await new Promise<string>((resolve, reject) => {
            const args = ['--version'];
            const terminalProcess = terminalProcessFactory({ command: process.execPath, args });
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

/**
 * @FIXME
 *
 * For some reason, we get a lot of garbage on `stdout` when on Windows.
 * Tested manually `example-browser` and `example-electron`, it seems like
 * the terminals are behaving correctly, meaning that it is only a problem
 * here in the tests.
 */
if (process.platform !== 'win32' || process.env.THEIA_PROCESS_TEST_OVERRIDE) {

    describe('TerminalProcess { shell: true }', function () {

        this.timeout(20_000);

        interface ProcessExit extends IProcessExitEvent {
            output: string;
        }

        // tslint:disable-next-line:no-any
        async function checkOutput(proc: TerminalProcess, pattern?: RegExp): Promise<ProcessExit> {
            return new Promise<ProcessExit>((resolve, reject) => {
                let output = '';
                proc.outputStream.on('data', chunk => output += chunk);
                proc.onExit(async exit => {
                    if (pattern) {
                        expect(output).match(pattern, output);
                    }
                    resolve({ ...exit, output });
                });
                proc.onError(reject);
            });
        }

        it('should execute the command as a whole if not arguments are specified', async function () {
            const proc = terminalProcessFactory({ command: 'echo a b c', options: { shell: true } });
            const exit = await checkOutput(proc, /^a b c/);
            expect(exit.code).eq(0);
        });

        it('should fail if user defines a full command line and arguments', async function () {
            const proc = terminalProcessFactory({ command: 'echo a b c', args: [], options: { shell: true } });
            const exit = await checkOutput(proc);
            expect(exit.code).not.eq(0);
        });

        it('should be able to exec using simple arguments', async function () {
            const proc = terminalProcessFactory({ command: 'echo', args: ['a', 'b', 'c'], options: { shell: true } });
            const exit = await checkOutput(proc, /^a b c/);
            expect(exit.code).eq(0);
        });

        it('should be able to run using arguments containing whitespace', async function () {
            const proc = terminalProcessFactory({ command: 'echo', args: ['a', 'b', '   c'], options: { shell: true } });
            const exit = await checkOutput(proc, /^a b    c/);
            expect(exit.code).eq(0);
        });

        it('will fail if user specify problematic arguments', async function () {
            const proc = terminalProcessFactory({ command: 'echo', args: ['a', 'b', 'c"'], options: { shell: true } });
            const exit = await checkOutput(proc);
            expect(exit.code).not.eq(0);
        });

        it('should be able to run using arguments specifying which quoting method to use', async function () {
            const proc = terminalProcessFactory({ command: 'echo', args: ['a', 'b', { value: 'c"', quoting: 'escaped' }], options: { shell: true } });
            const exit = await checkOutput(proc, /^a b c"/);
            expect(exit.code).eq(0);
        });

    });

}
