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
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { ILogger, PreferenceService } from '@theia/core';
import { RequestContext, RequestOptions, RequestService } from '@theia/core/shared/@theia/request';
import { GitHubTarballSourceImpl } from './github-tarball-source';

const TARBALL_URL = 'https://api.github.com/repos/example/plugins/tarball';
const ARCHIVE_ROOT = 'example-plugins-9f3c2a1b';

/** One tar entry: a regular file, a directory, a symlink or a hard link. */
interface TarEntry {
    name: string;
    content?: string;
    type?: 'file' | 'directory' | 'symlink' | 'link';
    linkname?: string;
}

const TYPE_FLAGS = { file: '0', link: '1', symlink: '2', directory: '5' };

/**
 * Writes a minimal but valid ustar archive.
 *
 * Hand-written on purpose: entry names that a real archiver refuses to produce - an absolute path, a
 * `..` segment, a symlink pointing out of the tree - are exactly what the extraction guard must reject.
 */
function tar(entries: TarEntry[]): Buffer {
    const blocks: Buffer[] = [];
    for (const entry of entries) {
        const type = entry.type ?? 'file';
        const content = Buffer.from(entry.content ?? '');
        const size = type === 'file' ? content.length : 0;
        const header = Buffer.alloc(512, 0);
        header.write(entry.name, 0, 100, 'utf8');
        header.write('0000755\0', 100, 8, 'utf8');
        header.write('0000000\0', 108, 8, 'utf8');
        header.write('0000000\0', 116, 8, 'utf8');
        header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
        header.write('00000000000\0', 136, 12, 'utf8');
        header.write('        ', 148, 8, 'utf8');
        header.write(TYPE_FLAGS[type], 156, 1, 'utf8');
        header.write(entry.linkname ?? '', 157, 100, 'utf8');
        header.write('ustar\0', 257, 6, 'utf8');
        header.write('00', 263, 2, 'utf8');
        let checksum = 0;
        for (const byte of header) {
            checksum += byte;
        }
        header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
        blocks.push(header);
        if (size > 0) {
            const padded = Buffer.alloc(Math.ceil(size / 512) * 512, 0);
            content.copy(padded);
            blocks.push(padded);
        }
    }
    // Two zero blocks terminate the archive.
    blocks.push(Buffer.alloc(1024, 0));
    return Buffer.concat(blocks);
}

class FakeRequestService implements RequestService {
    public requestedUrls: string[] = [];
    public lastHeaders: Record<string, string | string[]> | undefined;
    constructor(private readonly body: Buffer | undefined, private readonly statusCode = 200) { }
    async configure(): Promise<void> { /* no-op */ }
    async resolveProxy(): Promise<string | undefined> { return undefined; }
    async request(options: RequestOptions): Promise<RequestContext> {
        this.requestedUrls.push(options.url);
        this.lastHeaders = options.headers as Record<string, string | string[]> | undefined;
        return {
            url: options.url,
            res: { headers: {}, statusCode: this.body ? this.statusCode : 404 },
            buffer: this.body ? new Uint8Array(this.body) : new Uint8Array()
        };
    }
}

const fakePreferenceService = { get: () => undefined } as unknown as PreferenceService;
const silentLogger = {
    warn: () => Promise.resolve(),
    error: () => Promise.resolve(),
    info: () => Promise.resolve(),
    debug: () => Promise.resolve(),
    trace: () => Promise.resolve()
} as unknown as ILogger;

class TestGitHubTarballSource extends GitHubTarballSourceImpl {
    constructor(request: RequestService, protected readonly caps: { archive?: number; extracted?: number } = {}) {
        super();
        Object.assign(this, { requestService: request, preferenceService: fakePreferenceService, logger: silentLogger });
    }
    protected override maxArchiveBytes(): number {
        return this.caps.archive ?? super.maxArchiveBytes();
    }
    protected override maxExtractedBytes(): number {
        return this.caps.extracted ?? super.maxExtractedBytes();
    }
}

async function exists(target: string): Promise<boolean> {
    try {
        await fs.lstat(target);
        return true;
    } catch {
        return false;
    }
}

async function expectRejection(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }
    throw new Error('Expected the promise to be rejected.');
}

describe('GitHubTarballSource', () => {

    let destination: string;

    beforeEach(async () => {
        destination = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-tarball-test-'));
    });

    afterEach(async () => {
        await fs.rm(destination, { recursive: true, force: true });
    });

    function source(
        body: Buffer | undefined,
        statusCode = 200,
        caps: { archive?: number; extracted?: number } = {}
    ): { service: TestGitHubTarballSource; request: FakeRequestService } {
        const request = new FakeRequestService(body, statusCode);
        return { service: new TestGitHubTarballSource(request, caps), request };
    }

    function archive(entries: TarEntry[]): Buffer {
        return gzipSync(tar(entries));
    }

    const pluginArchive = (): Buffer => archive([
        { name: `${ARCHIVE_ROOT}/`, type: 'directory' },
        { name: `${ARCHIVE_ROOT}/plugin.json`, content: '{"name":"demo"}' },
        { name: `${ARCHIVE_ROOT}/skills/`, type: 'directory' },
        { name: `${ARCHIVE_ROOT}/skills/deploy/SKILL.md`, content: '# Deploy' }
    ]);

    it('downloads the repository tarball in one request and strips the archive top-level directory', async () => {
        const { service, request } = source(pluginArchive());

        const tree = await service.fetch({ sourceUrl: 'https://github.com/example/plugins.git', destination });

        expect(request.requestedUrls).to.deep.equal([TARBALL_URL]);
        expect(request.lastHeaders?.['User-Agent']).to.equal('Theia-AI-Registry');
        expect(await fs.readFile(path.join(destination, 'plugin.json'), 'utf8')).to.equal('{"name":"demo"}');
        expect(await fs.readFile(path.join(destination, 'skills', 'deploy', 'SKILL.md'), 'utf8')).to.equal('# Deploy');
        expect(tree.fileCount).to.equal(2);
    });

    it('keeps only the requested subtree and makes it the root', async () => {
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/README.md`, content: 'repository readme' },
            { name: `${ARCHIVE_ROOT}/plugins/demo/plugin.json`, content: '{"name":"demo"}' },
            { name: `${ARCHIVE_ROOT}/plugins/demo/skills/deploy/SKILL.md`, content: '# Deploy' },
            { name: `${ARCHIVE_ROOT}/plugins/other/plugin.json`, content: '{"name":"other"}' }
        ]));

        await service.fetch({ sourceUrl: 'https://github.com/example/plugins', sourcePath: 'plugins/demo', destination });

        expect(await fs.readFile(path.join(destination, 'plugin.json'), 'utf8')).to.equal('{"name":"demo"}');
        expect(await exists(path.join(destination, 'skills', 'deploy', 'SKILL.md'))).to.equal(true);
        expect(await exists(path.join(destination, 'README.md'))).to.equal(false);
        expect(await exists(path.join(destination, 'plugins'))).to.equal(false);
    });

    it('fails when the requested subtree is not in the repository', async () => {
        const { service } = source(pluginArchive());

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', sourcePath: 'plugins/missing', destination }));

        expect(error.message).to.match(/plugins\/missing/);
        expect(error.message).to.match(/does not exist/i);
    });

    it('reports a subtree that exists but holds no installable file as such, not as a wrong path', async () => {
        // Only a directory and a link out of the subtree: the path is right, there is just nothing to
        // install under it. Telling the user the path does not exist would send them looking for a typo.
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugins/demo/`, type: 'directory' },
            { name: `${ARCHIVE_ROOT}/plugins/demo/nested/`, type: 'directory' },
            { name: `${ARCHIVE_ROOT}/plugins/demo/vendor`, type: 'symlink', linkname: '../..' }
        ]));

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', sourcePath: 'plugins/demo', destination }));

        expect(error.message).to.match(/holds no file to install/i);
        expect(error.message).to.not.match(/does not exist/i);
        expect(error.message).to.match(/plugins\/demo/);
    });

    it('reports a repository that holds no installable file as such, not as empty', async () => {
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/`, type: 'directory' },
            { name: `${ARCHIVE_ROOT}/docs/`, type: 'directory' }
        ]));

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination }));

        expect(error.message).to.match(/holds no file to install/i);
    });

    it('rejects an entry with an absolute path, writing nothing outside the destination', async () => {
        const escaped = path.join(destination, '..', 'absolute-escape.txt');
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugin.json`, content: '{"name":"demo"}' },
            { name: `${escaped}`, content: 'pwned' }
        ]));

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination }));

        expect(error.message).to.match(/outside the plugin directory/i);
        expect(await exists(escaped)).to.equal(false);
    });

    it('rejects an entry containing a .. segment, writing nothing outside the destination', async () => {
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugin.json`, content: '{"name":"demo"}' },
            { name: `${ARCHIVE_ROOT}/../relative-escape.txt`, content: 'pwned' }
        ]));

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination }));

        expect(error.message).to.match(/outside the plugin directory/i);
        expect(await exists(path.join(destination, '..', 'relative-escape.txt'))).to.equal(false);
    });

    it('drops a symlink whose target resolves outside the plugin, and installs the rest', async () => {
        // The link itself would be written *inside* the plugin; only its target is outside. A monorepo
        // plugin with a `LICENSE -> ../../LICENSE` is the ordinary case, so losing the link is right and
        // failing the whole install is not.
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugin.json`, content: '{"name":"demo"}' },
            { name: `${ARCHIVE_ROOT}/escape`, type: 'symlink', linkname: '../../..' }
        ]));

        const tree = await service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination });

        expect(tree.droppedLinks).to.deep.equal(['escape']);
        expect(await exists(path.join(destination, 'escape'))).to.equal(false);
        expect(await fs.readFile(path.join(destination, 'plugin.json'), 'utf8')).to.equal('{"name":"demo"}');
    });

    it('drops a hard link whose target resolves outside the plugin, and installs the rest', async () => {
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugin.json`, content: '{"name":"demo"}' },
            { name: `${ARCHIVE_ROOT}/hard`, type: 'link', linkname: '/etc/passwd' }
        ]));

        const tree = await service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination });

        expect(tree.droppedLinks).to.deep.equal(['hard']);
        expect(await exists(path.join(destination, 'hard'))).to.equal(false);
        expect(await fs.readFile(path.join(destination, 'plugin.json'), 'utf8')).to.equal('{"name":"demo"}');
    });

    it('drops a link pointing out of the requested subtree without failing the install', async () => {
        // The shape that made an endorsed monorepo plugin uninstallable: out-of-subtree *content* was
        // dropped silently while an out-of-subtree *link* failed everything.
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugins/demo/plugin.json`, content: '{"name":"demo"}' },
            { name: `${ARCHIVE_ROOT}/plugins/demo/vendor`, type: 'symlink', linkname: '../..' }
        ]));

        const tree = await service.fetch({ sourceUrl: 'https://github.com/example/plugins', sourcePath: 'plugins/demo', destination });

        expect(tree.droppedLinks).to.deep.equal(['vendor']);
        expect(await fs.readFile(path.join(destination, 'plugin.json'), 'utf8')).to.equal('{"name":"demo"}');
    });

    it('drops the second link of a chain that is only lexically contained, writing nothing outside', async () => {
        // `sub/up -> ..` and `s -> sub/up/..` are each lexically inside the destination, but resolving
        // the second one through the first lands on the destination's parent. A purely lexical check
        // cannot see that; the kept-symlink walk can.
        const outside = path.join(destination, '..', 'chain-escape.txt');
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugin.json`, content: '{"name":"demo"}' },
            { name: `${ARCHIVE_ROOT}/sub/`, type: 'directory' },
            { name: `${ARCHIVE_ROOT}/sub/up`, type: 'symlink', linkname: '..' },
            { name: `${ARCHIVE_ROOT}/s`, type: 'symlink', linkname: 'sub/up/..' }
        ]));

        const tree = await service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination });

        expect(tree.droppedLinks).to.deep.equal(['s']);
        expect(await exists(path.join(destination, 's'))).to.equal(false);
        expect(await exists(outside)).to.equal(false);
        expect(await fs.readFile(path.join(destination, 'plugin.json'), 'utf8')).to.equal('{"name":"demo"}');
    });

    // Skipped on Windows, where creating a symlink needs elevation or developer mode: `tar-fs` drops the
    // entry there whatever the guard decides, so the assertion would be about the OS, not about us.
    (process.platform === 'win32' ? it.skip : it)('keeps a symlink whose target stays inside the destination', async () => {
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugin.json`, content: '{"name":"demo"}' },
            { name: `${ARCHIVE_ROOT}/alias.json`, type: 'symlink', linkname: 'plugin.json' }
        ]));

        await service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination });

        expect(await fs.readFile(path.join(destination, 'alias.json'), 'utf8')).to.equal('{"name":"demo"}');
    });

    it('refuses an archive larger than the download cap before extracting anything', async () => {
        const { service } = source(pluginArchive(), 200, { archive: 16 });

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination }));

        expect(error.message).to.match(/too large/i);
        expect(await exists(path.join(destination, 'plugin.json'))).to.equal(false);
    });

    it('refuses a tree larger than the extraction cap, and writes nothing past it', async () => {
        // A gzip bomb compresses to almost nothing, so the download cap cannot catch it - the entry
        // sizes have to be added up while mapping. Modelled by lowering the cap rather than by
        // generating hundreds of megabytes.
        const { service } = source(archive([
            { name: `${ARCHIVE_ROOT}/plugin.json`, content: '0123456789' },
            { name: `${ARCHIVE_ROOT}/huge.bin`, content: '0123456789' }
        ]), 200, { extracted: 15 });

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination }));

        expect(error.message).to.match(/too large/i);
        expect(await exists(path.join(destination, 'huge.bin'))).to.equal(false);
    });

    it('refuses a source that is not a GitHub repository', async () => {
        const { service, request } = source(pluginArchive());

        const error = await expectRejection(service.fetch({ sourceUrl: 'https://gitlab.com/example/plugins.git', destination }));

        expect(error.message).to.match(/not GitHub/i);
        expect(request.requestedUrls).to.deep.equal([]);
    });

    it('refuses a source URL that names no repository', async () => {
        const { service } = source(pluginArchive());

        expect((await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example', destination }))).message)
            .to.match(/owner\/repo/i);
    });

    it('reports the HTTP status when the download fails', async () => {
        const { service } = source(undefined);

        expect((await expectRejection(service.fetch({ sourceUrl: 'https://github.com/example/plugins', destination }))).message)
            .to.match(/HTTP 404/);
    });
});
