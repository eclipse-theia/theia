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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect } from 'chai';
import { ArchiveExtractorImpl } from '@theia/filesystem/lib/node/archive/archive-extractor';
import { createTestTar, createTestZip } from '@theia/filesystem/lib/node/archive/test/test-archives';
import { DependencyDownload } from './remote-native-dependency-contribution';
import { NativeDependencyFile, RemoteNativeDependencyService } from './remote-native-dependency-service';

class TestableRemoteNativeDependencyService extends RemoteNativeDependencyService {
    constructor() {
        super();
        this.archiveExtractor = new ArchiveExtractorImpl();
    }

    publicStoreDependency(dependency: DependencyDownload, directory: string): Promise<NativeDependencyFile[]> {
        return this.storeDependency(dependency, directory);
    }
}

describe('RemoteNativeDependencyService', () => {

    const service = new TestableRemoteNativeDependencyService();
    let directory: string;

    beforeEach(async () => {
        directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'remote-native-dependency-'));
    });

    afterEach(async () => {
        await fs.promises.rm(directory, { recursive: true, force: true });
    });

    it('extracts a zip archive and lists its entries with their target and mode', async () => {
        const files = await service.publicStoreDependency({
            archive: 'zip',
            buffer: createTestZip([
                { name: 'lib/', mode: 0o040755 },
                { name: 'lib/native.node', mode: 0o100755, data: 'binary' },
                { name: 'lib/README.md', mode: 0o100644, data: 'readme' }
            ])
        }, directory);
        expect(files).to.deep.equal([
            { path: path.join(directory, 'lib'), target: 'lib', mode: 0o755 },
            { path: path.join(directory, 'lib', 'native.node'), target: 'lib/native.node', mode: 0o755 },
            { path: path.join(directory, 'lib', 'README.md'), target: 'lib/README.md', mode: 0o644 }
        ]);
        expect(await fs.promises.readFile(path.join(directory, 'lib', 'native.node'), 'utf8')).to.equal('binary');
    });

    for (const archive of ['tar', 'tgz'] as const) {
        it(`extracts a ${archive} archive`, async () => {
            const files = await service.publicStoreDependency({
                archive,
                buffer: await createTestTar([{ name: 'bin/tool', mode: 0o755, data: 'tool' }], archive === 'tgz')
            }, directory);
            expect(files).to.deep.equal([{ path: path.join(directory, 'bin', 'tool'), target: 'bin/tool', mode: 0o755 }]);
        });
    }

    it('uses the declared archive format', async () => {
        let error: unknown;
        try {
            await service.publicStoreDependency({ archive: 'tgz', buffer: createTestZip([{ name: 'file.txt' }]) }, directory);
        } catch (e) {
            error = e;
        }
        expect(String(error)).to.match(/incorrect header check/);
    });

    it('rejects an archive with an entry that leaves the directory', async () => {
        let error: unknown;
        try {
            await service.publicStoreDependency({ archive: 'zip', buffer: createTestZip([{ name: '../evil.txt', data: 'evil' }]) }, directory);
        } catch (e) {
            error = e;
        }
        expect(String(error)).to.match(/invalid relative path|leaves the extraction directory/);
        expect(fs.existsSync(path.join(path.dirname(directory), 'evil.txt'))).to.be.false;
    });

    it('stores a single file as is', async () => {
        const files = await service.publicStoreDependency({
            file: { path: 'bin/tool', mode: 0o755 },
            buffer: Buffer.from('tool')
        }, directory);
        expect(files).to.deep.equal([{ path: path.join(directory, 'tool'), target: 'bin/tool', mode: 0o755 }]);
        expect(await fs.promises.readFile(path.join(directory, 'tool'), 'utf8')).to.equal('tool');
    });
});
