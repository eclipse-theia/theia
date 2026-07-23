// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import * as os from 'os';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { NodeFileUploadService } from './node-file-upload-service';

/** Captures what the upload handler wrote to the Express response. */
interface CapturedResponse {
    statusCode?: number;
    sentStatus?: number;
    body?: unknown;
}

describe('NodeFileUploadService', () => {

    let tempDir: string;

    function createService(): NodeFileUploadService {
        const service = new NodeFileUploadService();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any)['logger'] = { error: () => { } };
        return service;
    }

    function createResponse(): { res: unknown, captured: CapturedResponse } {
        const captured: CapturedResponse = {};
        const res = {
            status(code: number): unknown {
                captured.statusCode = code;
                return res;
            },
            send(body: unknown): void {
                captured.body = body;
            },
            sendStatus(code: number): void {
                captured.sentStatus = code;
            }
        };
        return { res, captured };
    }

    async function handleUpload(filePath: string | undefined, body: unknown): Promise<CapturedResponse> {
        const service = createService();
        const { res, captured } = createResponse();
        const request = { file: filePath === undefined ? undefined : { path: filePath }, body };
        // handleFileUpload is protected; invoke it directly to exercise the input validation.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (service as any).handleFileUpload(request, res);
        return captured;
    }

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'theia-upload-spec-'));
    });

    afterEach(async () => {
        await fs.remove(tempDir);
    });

    it('should reject a non-file: URI with 400', async () => {
        const source = path.join(tempDir, 'source.txt');
        await fs.writeFile(source, 'payload');
        const captured = await handleUpload(source, { uri: 'http://evil.example/usr/bin/bash' });
        expect(captured.sentStatus).to.equal(400);
        // The scoped-write guard must reject before any file operation runs.
        expect(await fs.pathExists(source)).to.be.true;
    });

    it('should reject a remote-scheme URI with 400', async () => {
        const source = path.join(tempDir, 'source.txt');
        await fs.writeFile(source, 'payload');
        const captured = await handleUpload(source, { uri: 'vscode-remote://host/usr/bin/bash' });
        expect(captured.sentStatus).to.equal(400);
        expect(await fs.pathExists(source)).to.be.true;
    });

    it('should reject a missing uri field with 400', async () => {
        const source = path.join(tempDir, 'source.txt');
        await fs.writeFile(source, 'payload');
        const captured = await handleUpload(source, {});
        expect(captured.sentStatus).to.equal(400);
    });

    it('should reject a missing file with 400', async () => {
        const target = FileUri.create(path.join(tempDir, 'target.txt')).toString();
        const captured = await handleUpload(undefined, { uri: target });
        expect(captured.sentStatus).to.equal(400);
    });

    it('should accept a file: URI and move the upload to the target', async () => {
        const source = path.join(tempDir, 'source.txt');
        await fs.writeFile(source, 'payload');
        const targetPath = path.join(tempDir, 'target.txt');
        const target = FileUri.create(targetPath).toString();

        const captured = await handleUpload(source, { uri: target });

        expect(captured.sentStatus).to.be.undefined;
        expect(captured.statusCode).to.equal(200);
        // Compare against the canonical fs-path of the URI: on Windows the create/fsPath round-trip
        // normalizes the drive letter to lower-case (e.g. `C:` -> `c:`), which would otherwise fail
        // an exact string match against `targetPath` derived from `os.tmpdir()`.
        expect(captured.body).to.equal(FileUri.fsPath(target));
        expect(await fs.pathExists(targetPath)).to.be.true;
        expect(await fs.readFile(targetPath, 'utf8')).to.equal('payload');
        // The temp source file was moved, not copied.
        expect(await fs.pathExists(source)).to.be.false;
    });
});
