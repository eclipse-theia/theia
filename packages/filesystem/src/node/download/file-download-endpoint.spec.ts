// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import express from '@theia/core/shared/express';
import { Container } from '@theia/core/shared/inversify';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { HttpConnectionValidator } from '@theia/core/lib/node';
import { FileDownloadEndpoint } from './file-download-endpoint.js';
import { FileDownloadHandler } from './file-download-handler.js';

describe('FileDownloadEndpoint', () => {

    let tempRoot: string;
    let hiddenFile: string;
    let server: http.Server;
    let baseUrl: string;

    before(async () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-file-download-endpoint-'));
        const hiddenDir = path.join(tempRoot, '.vscode');
        fs.mkdirSync(hiddenDir, { recursive: true });
        hiddenFile = path.join(hiddenDir, 'settings.json');
        fs.writeFileSync(hiddenFile, '{"editor.tabSize":4}');

        const container = new Container();
        const noopHandler = { handle: async () => undefined } as unknown as FileDownloadHandler;
        container.bind(FileDownloadHandler).toConstantValue(noopHandler).whenTargetNamed(FileDownloadHandler.SINGLE);
        container.bind(FileDownloadHandler).toConstantValue(noopHandler).whenTargetNamed(FileDownloadHandler.MULTI);
        container.bind(FileDownloadHandler).toConstantValue(noopHandler).whenTargetNamed(FileDownloadHandler.DOWNLOAD_LINK);
        container.bind<HttpConnectionValidator>(HttpConnectionValidator).toConstantValue({
            validateRequest(_req, _res, next): void {
                next();
            }
        });
        container.bind(FileDownloadEndpoint).toSelf();

        const endpoint = container.get(FileDownloadEndpoint);
        const app = express();
        endpoint.configure(app);
        server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Unexpected server address');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('serves files inside hidden dot-directories on /file', async () => {
        const uri = encodeURIComponent(FileUri.create(hiddenFile).toString());
        const response = await fetch(`${baseUrl}/file?${uri}`);
        expect(response.status).to.equal(200);
        expect(await response.text()).to.equal('{"editor.tabSize":4}');
    });
});
