// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import * as chai from 'chai';
import * as os from 'os';
import * as path from 'path';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { createTerminalTestContainer } from './test/terminal-test-container';
import { IShellTerminalServer, IShellTerminalServerOptions } from '../common/shell-terminal-protocol';

/**
 * Globals
 */

const expect = chai.expect;

describe('ShellServer', function (): void {

    this.timeout(5000);
    let shellTerminalServer: IShellTerminalServer;

    beforeEach(() => {
        shellTerminalServer = createTerminalTestContainer().get(IShellTerminalServer);
    });

    it('test shell terminal create', async function (): Promise<void> {
        const createResult = shellTerminalServer.create({});

        expect(await createResult).to.be.greaterThan(-1);
    });

    describe('validateTerminalOptions', () => {

        // Access the protected method for direct testing
        function validate(options: IShellTerminalServerOptions): IShellTerminalServerOptions {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (shellTerminalServer as any).validateTerminalOptions(options);
            return options;
        }

        it('should accept valid options unchanged', () => {
            const options = validate({ cols: 80, rows: 24 });
            expect(options.cols).to.equal(80);
            expect(options.rows).to.equal(24);
        });

        it('should reset cols/rows outside valid range', () => {
            const options = validate({ cols: -1, rows: 9999 });
            expect(options.cols).to.be.undefined;
            expect(options.rows).to.be.undefined;
        });

        it('should reset non-integer cols/rows', () => {
            const options = validate({ cols: 80.5, rows: NaN });
            expect(options.cols).to.be.undefined;
            expect(options.rows).to.be.undefined;
        });

        it('should accept valid string args', () => {
            const options = validate({ args: ['-l', '--color'] });
            expect(options.args).to.deep.equal(['-l', '--color']);
        });

        it('should accept a single string as args', () => {
            const options = validate({ args: '-l' });
            expect(options.args).to.equal('-l');
        });

        it('should reset args with non-string elements', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const options = validate({ args: ['-l', 42 as any] });
            expect(options.args).to.be.undefined;
        });

        it('should reset non-array non-string args', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const options = validate({ args: { cmd: 'evil' } as any });
            expect(options.args).to.be.undefined;
        });

        it('should accept rootURI pointing to an existing directory', () => {
            const uri = FileUri.create(os.tmpdir()).toString();
            const options = validate({ rootURI: uri });
            expect(options.rootURI).to.equal(uri);
        });

        it('should reset rootURI pointing to a non-existent path', () => {
            const options = validate({ rootURI: 'file:///nonexistent/path/xyz123' });
            expect(options.rootURI).to.be.undefined;
        });

        it('should reset rootURI pointing to a file instead of directory', () => {
            const filePath = path.join(os.tmpdir(), 'theia-test-' + Date.now());
            require('fs').writeFileSync(filePath, 'test');
            try {
                const options = validate({ rootURI: FileUri.create(filePath).toString() });
                expect(options.rootURI).to.be.undefined;
            } finally {
                require('fs').unlinkSync(filePath);
            }
        });

        it('should reset shell that does not exist', () => {
            const options = validate({ shell: '/nonexistent/shell' });
            expect(options.shell).to.be.undefined;
        });

        it('should accept a valid shell', () => {
            // process.execPath is the Node binary used to run the tests, so it always exists
            // and is executable on every platform - making it a reliable cross-platform shell value.
            const options = validate({ shell: process.execPath });
            expect(options.shell).to.equal(process.execPath);
        });

        it('should reset non-string shell type', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const options = validate({ shell: 42 as any });
            expect(options.shell).to.be.undefined;
        });

        it('should reset malformed rootURI', () => {
            const options = validate({ rootURI: 'not-a-valid-uri' });
            expect(options.rootURI).to.be.undefined;
        });

        it('should reject cols: 0 (below minimum)', () => {
            const options = validate({ cols: 0 });
            expect(options.cols).to.be.undefined;
        });

        it('should accept cols: 500 (upper boundary)', () => {
            const options = validate({ cols: 500 });
            expect(options.cols).to.equal(500);
        });

        it('should reject cols: 501 (above maximum)', () => {
            const options = validate({ cols: 501 });
            expect(options.cols).to.be.undefined;
        });

        it('should accept rows: 1 (lower boundary)', () => {
            const options = validate({ rows: 1 });
            expect(options.rows).to.equal(1);
        });
    });
});
