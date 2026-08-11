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
import { ILogger, PreferenceService } from '@theia/core';
import { RequestContext, RequestOptions, RequestService } from '@theia/core/shared/@theia/request';
import { ResolvedSkillEntry } from '../common/skill/skill-registry-types';
import { computeSkillContentHash } from '../common/skill/skill-content-hash';
import { SkillInstallBackendServiceImpl } from './skill-install-backend-service';

const REGISTRY_METADATA_FILE = '.registry.json';

const SKILL_MD = '---\nname: example-skill\n---\n# Example';
const HELPER_MD = 'helper content';

// The registry hash equals the hash our backend computes for the faithfully-downloaded
// content: reproducing the registry algorithm is exactly what lets a single stored hash
// drive both update detection (registry hash changed) and drift detection (on-disk changed).
function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}
const REGISTRY_HASH = computeSkillContentHash([
    { relativePath: 'SKILL.md', content: encode(SKILL_MD) },
    { relativePath: 'helper.md', content: encode(HELPER_MD) }
]);

const entry: ResolvedSkillEntry = {
    skillId: 'io.github.example/example-skill',
    name: 'example-skill',
    description: 'An example skill',
    sourceUrl: 'https://github.com/example/skills',
    sourcePath: 'skills/example',
    contentHash: REGISTRY_HASH
};

const API_URL = 'https://api.github.com/repos/example/skills/contents/skills/example';

class FakeRequestService implements RequestService {
    constructor(private readonly responses: Record<string, string>) { }
    async configure(): Promise<void> { /* no-op */ }
    async resolveProxy(): Promise<string | undefined> { return undefined; }
    async request(options: RequestOptions): Promise<RequestContext> {
        const body = this.responses[options.url];
        if (body === undefined) {
            return { url: options.url, res: { headers: {}, statusCode: 404 }, buffer: new Uint8Array() };
        }
        return { url: options.url, res: { headers: {}, statusCode: 200 }, buffer: new TextEncoder().encode(body) };
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

class TestSkillInstallBackendService extends SkillInstallBackendServiceImpl {
    constructor(private readonly root: string, request: RequestService) {
        super();
        Object.assign(this, { requestService: request, preferenceService: fakePreferenceService, logger: silentLogger });
    }
    protected override skillsRoot(): string {
        return this.root;
    }
    /** Exposes the in-memory drift-hash cache size so eviction can be asserted. */
    cacheSize(): number {
        return this.hashCache.size;
    }
    /** Simulates an irrecoverable watcher error path so client notification can be asserted. */
    triggerWatcherStopped(): void {
        this.notifyWatcherStopped();
    }
    /** Exposes the startup staging-folder sweep so it can be asserted without going through @postConstruct. */
    sweepStaging(): Promise<void> {
        return this.sweepStagingFolders();
    }
}

/** Builds a fake GitHub Contents API + raw responses for a skill with the given SKILL.md content. */
function githubResponses(skillMd: string): Record<string, string> {
    return {
        [API_URL]: JSON.stringify([
            { type: 'file', name: 'SKILL.md', path: 'skills/example/SKILL.md', download_url: 'https://raw.example/SKILL.md' },
            { type: 'file', name: 'helper.md', path: 'skills/example/helper.md', download_url: 'https://raw.example/helper.md' }
        ]),
        'https://raw.example/SKILL.md': skillMd,
        'https://raw.example/helper.md': HELPER_MD
    };
}

async function exists(target: string): Promise<boolean> {
    try {
        await fs.stat(target);
        return true;
    } catch {
        return false;
    }
}

describe('SkillInstallBackendService', () => {

    let root: string;

    const created: TestSkillInstallBackendService[] = [];

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-install-test-'));
        created.length = 0;
    });

    afterEach(async () => {
        created.forEach(svc => svc.dispose());
        await fs.rm(root, { recursive: true, force: true });
    });

    function service(responses: Record<string, string>): TestSkillInstallBackendService {
        const svc = new TestSkillInstallBackendService(root, new FakeRequestService(responses));
        created.push(svc);
        return svc;
    }

    it('installs a skill into <root>/<name>, writing the downloaded files and a registry metadata file', async () => {
        await service(githubResponses(SKILL_MD)).install(entry);

        const dir = path.join(root, 'example-skill');
        expect(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')).to.equal(SKILL_MD);
        expect(await fs.readFile(path.join(dir, 'helper.md'), 'utf8')).to.equal('helper content');
        const metadata = JSON.parse(await fs.readFile(path.join(dir, REGISTRY_METADATA_FILE), 'utf8'));
        expect(metadata.skillId).to.equal(entry.skillId);
        // The registry hash is stored verbatim - the single baseline for update and drift.
        expect(metadata.contentHash).to.equal(entry.contentHash);
    });

    it('reports no drift after a faithful install and drift once local files diverge', async () => {
        const svc = service(githubResponses(SKILL_MD));
        await svc.install(entry);

        let installed = await svc.listInstalledSkills();
        expect(installed[0].contentHash).to.equal(entry.contentHash);
        expect(installed[0].drifted).to.equal(false);

        await fs.writeFile(path.join(root, 'example-skill', 'helper.md'), 'edited locally to a clearly different length');
        installed = await svc.listInstalledSkills();
        expect(installed[0].drifted).to.equal(true);
        expect(installed[0].contentHash).to.equal(entry.contentHash);
    });

    it('notifies a registered client when the skills folder changes on disk', async function (): Promise<void> {
        this.timeout(8000);
        const svc = service(githubResponses(SKILL_MD));
        let notifications = 0;
        svc.setClient({ notifyDidChangeInstalledSkills: () => { notifications += 1; }, notifyWatcherStopped: () => { } });
        // Allow the (async) recursive watcher to start before triggering a change.
        await new Promise(resolve => setTimeout(resolve, 700));
        await fs.mkdir(path.join(root, 'externally-added'), { recursive: true });
        // Wait past the debounce window for the notification to land.
        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(notifications).to.be.greaterThan(0);
    });

    it('refuses to install a skill whose name would escape the skills root', async () => {
        let caught: Error | undefined;
        try {
            await service(githubResponses(SKILL_MD)).install({ ...entry, name: '../escaped' });
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/invalid skill name/i);
        // Nothing must be written outside the skills root.
        expect(await exists(path.join(root, '..', 'escaped'))).to.equal(false);
    });

    it('refuses an uninstall whose name contains a path separator', async () => {
        let caught: Error | undefined;
        try {
            await service(githubResponses(SKILL_MD)).uninstall('nested/skill');
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/invalid skill name/i);
    });

    it('refuses to install over an existing folder of the same name', async () => {
        await fs.mkdir(path.join(root, 'example-skill'), { recursive: true });

        let caught: Error | undefined;
        try {
            await service(githubResponses(SKILL_MD)).install(entry);
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/already exists/i);
    });

    it('aborts when the downloaded SKILL.md frontmatter name disagrees with the registry entry name', async () => {
        let caught: Error | undefined;
        try {
            await service(githubResponses('---\nname: wrong-name\n---\n# Example')).install(entry);
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/name mismatch/i);
        // The folder must not be left behind on a failed install.
        expect(await exists(path.join(root, 'example-skill'))).to.equal(false);
        // The finally block in writeSkill must also clean up the sibling staging folder.
        const leftovers = (await fs.readdir(root)).filter(name => name.startsWith('.installing-'));
        expect(leftovers).to.deep.equal([]);
    });

    it('refuses to clobber an existing folder of the same name when install() races with another install', async () => {
        // Simulate the race the existence check cannot catch: the target folder is created
        // after install() passes its exists(target) === false check but before the rename.
        // The rename onto a non-empty directory must fail rather than silently overwrite.
        const svc = service(githubResponses(SKILL_MD));
        const target = path.join(root, 'example-skill');
        // Wedge a non-empty folder into place after the existence check would have run.
        const originalExists = (svc as unknown as { exists: (target: string) => Promise<boolean> }).exists.bind(svc);
        let firstCall = true;
        (svc as unknown as { exists: (target: string) => Promise<boolean> }).exists = async (path_: string) => {
            if (firstCall && path_ === target) {
                firstCall = false;
                return false;
            }
            return originalExists(path_);
        };
        await fs.mkdir(target, { recursive: true });
        await fs.writeFile(path.join(target, 'pre-existing.txt'), 'do not clobber');

        let caught: Error | undefined;
        try {
            await svc.install(entry);
        } catch (error) {
            caught = error as Error;
        }
        expect(caught).to.not.equal(undefined);
        // The pre-existing folder content must be preserved untouched.
        expect(await fs.readFile(path.join(target, 'pre-existing.txt'), 'utf8')).to.equal('do not clobber');
        // The staging folder must also be cleaned up by the finally block.
        const leftovers = (await fs.readdir(root)).filter(name => name.startsWith('.installing-'));
        expect(leftovers).to.deep.equal([]);
    });

    it('sweepStagingFolders removes any leftover .installing-* folders from previous backend crashes', async () => {
        await fs.mkdir(path.join(root, '.installing-example-skill-123'), { recursive: true });
        await fs.writeFile(path.join(root, '.installing-example-skill-123', 'partial.txt'), 'leftover');
        await fs.mkdir(path.join(root, '.installing-another-456'), { recursive: true });
        // A non-staging dot-folder must be preserved.
        await fs.mkdir(path.join(root, '.other'), { recursive: true });

        await service(githubResponses(SKILL_MD)).sweepStaging();

        expect(await exists(path.join(root, '.installing-example-skill-123'))).to.equal(false);
        expect(await exists(path.join(root, '.installing-another-456'))).to.equal(false);
        expect(await exists(path.join(root, '.other'))).to.equal(true);
    });

    it('aborts when SKILL.md is missing from the downloaded content', async () => {
        const responses: Record<string, string> = {
            [API_URL]: JSON.stringify([
                { type: 'file', name: 'helper.md', path: 'skills/example/helper.md', download_url: 'https://raw.example/helper.md' }
            ]),
            'https://raw.example/helper.md': 'helper content'
        };

        let caught: Error | undefined;
        try {
            await service(responses).install(entry);
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/no SKILL\.md/i);
    });

    it('links an existing local folder by writing the registry metadata file without overwriting other files', async () => {
        const dir = path.join(root, 'example-skill');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'SKILL.md'), '---\nname: example-skill\n---\nlocal');

        await service(githubResponses(SKILL_MD)).link(entry);

        expect(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')).to.equal('---\nname: example-skill\n---\nlocal');
        const metadata = JSON.parse(await fs.readFile(path.join(dir, REGISTRY_METADATA_FILE), 'utf8'));
        expect(metadata.skillId).to.equal(entry.skillId);
    });

    it('fixSkill clean-replaces drifted files and clears the drift', async () => {
        const svc = service(githubResponses(SKILL_MD));
        await svc.install(entry);
        const dir = path.join(root, 'example-skill');
        await fs.writeFile(path.join(dir, 'helper.md'), 'locally drifted');

        let installed = await svc.listInstalledSkills();
        expect(installed[0].drifted).to.equal(true);

        await svc.fixSkill(entry);

        expect(await fs.readFile(path.join(dir, 'helper.md'), 'utf8')).to.equal('helper content');
        installed = await svc.listInstalledSkills();
        expect(installed[0].drifted).to.equal(false);
    });

    it('uninstall removes a folder that carries our registry metadata file', async () => {
        const svc = service(githubResponses(SKILL_MD));
        await svc.install(entry);

        await svc.uninstall('example-skill');

        expect(await exists(path.join(root, 'example-skill'))).to.equal(false);
    });

    it('uninstall leaves a folder without our registry metadata file untouched', async () => {
        const dir = path.join(root, 'manual-skill');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'SKILL.md'), 'manual');

        await service(githubResponses(SKILL_MD)).uninstall('manual-skill');

        expect(await exists(dir)).to.equal(true);
    });

    it('unlink removes the registry metadata file while keeping the other files', async () => {
        const svc = service(githubResponses(SKILL_MD));
        await svc.install(entry);
        const dir = path.join(root, 'example-skill');

        await svc.unlink('example-skill');

        expect(await exists(path.join(dir, REGISTRY_METADATA_FILE))).to.equal(false);
        expect(await exists(path.join(dir, 'SKILL.md'))).to.equal(true);
    });

    it('evicts cached drift hashes for skills that no longer exist', async () => {
        const svc = service(githubResponses(SKILL_MD));
        await svc.install(entry);
        await svc.listInstalledSkills();
        expect(svc.cacheSize()).to.equal(1);

        await svc.uninstall('example-skill');
        await svc.listInstalledSkills();
        expect(svc.cacheSize()).to.equal(0);
    });

    it('notifies registered clients when the watcher stops', async () => {
        const svc = service(githubResponses(SKILL_MD));
        let stopped = 0;
        svc.setClient({ notifyDidChangeInstalledSkills: () => { }, notifyWatcherStopped: () => { stopped += 1; } });

        svc.triggerWatcherStopped();

        expect(stopped).to.equal(1);
    });

    it('lists installed skills, distinguishing registry-managed folders from hand-placed ones', async () => {
        const svc = service(githubResponses(SKILL_MD));
        await svc.install(entry);
        await fs.mkdir(path.join(root, 'manual-skill'), { recursive: true });
        await fs.writeFile(path.join(root, 'manual-skill', 'SKILL.md'), 'manual');

        const installed = await svc.listInstalledSkills();
        const managed = installed.find(i => i.name === 'example-skill');
        const manual = installed.find(i => i.name === 'manual-skill');

        expect(managed?.skillId).to.equal(entry.skillId);
        expect(managed?.drifted).to.equal(false);
        expect(manual?.skillId).to.equal(undefined);
        expect(manual?.drifted).to.equal(false);
    });
});
