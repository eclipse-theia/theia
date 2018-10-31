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

describe('RawProcess', function() {

    this.timeout(5000);
    let rawProcessFactory: RawProcessFactory;

    beforeEach(() => {
        rawProcessFactory = createProcessTestContainer().get<RawProcessFactory>(RawProcessFactory);
    });

    it('test error on non-existent path', async function() {
        let error: NodeJS.ErrnoException | undefined = undefined;
        try {
            await rawProcessFactory.create({ command: '/non-existent' });
        } catch (err) {
            error = err;
        }

        expect(error).instanceof(Error);
        expect(error!.code).eq('ENOENT');
        expect(error!.errno).eq('ENOENT');
        expect(error!.path).eq('/non-existent');
    });

    it('test error on non-executable path', async function() {
        // Create a non-executable file.
        const f = track.openSync('non-executable');
        fs.writeSync(f.fd, 'echo bob');

        // Make really sure it's non-executable.
        let mode = fs.fstatSync(f.fd).mode;
        mode &= ~fs.constants.S_IXUSR;
        mode &= ~fs.constants.S_IXGRP;
        mode &= ~fs.constants.S_IXOTH;
        fs.fchmodSync(f.fd, mode);

        fs.closeSync(f.fd);

        let error: NodeJS.ErrnoException | undefined = undefined;
        try {
            await rawProcessFactory.create({ command: f.path });
        } catch (err) {
            error = err;
        }

        // On Windows, we get 'UNKNOWN'.
        const expectedCode = isWindows ? 'UNKNOWN' : 'EACCES';

        expect(error).instanceof(Error);
        expect(error!.code).eq(expectedCode);
        expect(error!.errno).eq(expectedCode);
    });

    it('test exit', async function() {
        const exitCode = await new Promise<number>(async (resolve, reject) => {
            const args = ['-e', 'process.exit(3)'];
            const rawProcess = await rawProcessFactory.create({ command: process.execPath, 'args': args });
            rawProcess.onExit(event => {
                resolve(event.code);
            });
        });

        expect(exitCode).eq(3);
    });

    it('test pipe stdout stream', async function() {
        const output = await new Promise<string>(async (resolve, reject) => {
            const args = ['-e', 'console.log("text to stdout")'];
            const outStream = new stream.PassThrough();
            const rawProcess = await rawProcessFactory.create({ command: process.execPath, 'args': args });

            rawProcess.stdout.pipe(outStream);

            let buf = '';
            outStream.on('data', data => {
                buf += data.toString();
            });
            outStream.on('end', () => {
                resolve(buf.trim());
            });
        });

        expect(output).to.be.equal('text to stdout');
    });

    it('test pipe stderr stream', async function() {
        const output = await new Promise<string>(async (resolve, reject) => {
            const args = ['-e', 'console.error("text to stderr")'];
            const outStream = new stream.PassThrough();
            const rawProcess = await rawProcessFactory.create({ command: process.execPath, 'args': args });

            rawProcess.stderr.pipe(outStream);

            let buf = '';
            outStream.on('data', data => {
                buf += data.toString();
            });
            outStream.on('end', () => {
                resolve(buf.trim());
            });
        });

        expect(output).to.be.equal('text to stderr');
    });
});
