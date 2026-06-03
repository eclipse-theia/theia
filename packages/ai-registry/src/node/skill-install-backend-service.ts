// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AsyncSubscription, subscribe } from '@theia/core/shared/@parcel/watcher';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable, PreferenceService } from '@theia/core';
import { Headers, RequestContext, RequestService } from '@theia/core/shared/@theia/request';
import { SkillInstallBackendService, SkillInstallClient } from '../common/skill/skill-install-protocol';
import { InstalledSkillInfo, ResolvedSkillEntry } from '../common/skill/skill-registry-types';
import { computeSkillContentHash, SkillFileContent } from '../common/skill/skill-content-hash';
import { GITHUB_TOKEN_PREF } from '../common/skill/skill-registry-preferences';

/** File name of the per-skill provenance sidecar. Dot-prefixed so it is excluded from the content hash. */
const SIDECAR_FILE = '.registry.json';
/** Skill manifest that must exist at the root of every skill. */
const SKILL_MANIFEST = 'SKILL.md';
const USER_AGENT = 'Theia-AI-Registry';
/** Quiet period (ms) collapsing a burst of filesystem events into a single change notification. */
const WATCH_DEBOUNCE_MS = 300;

interface SkillSidecar {
    skillId: string;
    /**
     * Registry content hash recorded at install/link time. It is the baseline for both
     * update detection (registry's current hash differs) and drift detection (the on-disk
     * content hash differs), which works because {@link computeSkillContentHash} reproduces
     * the registry's hash byte-for-byte.
     */
    contentHash: string;
    installedAt: string;
}

interface GitHubContentItem {
    type: string;
    name: string;
    path: string;
    download_url?: string;
}

/** A hash-relevant file discovered while traversing a skill folder, with the stats that form its drift signature. */
interface SkillStatEntry {
    relativePath: string;
    full: string;
    size: number;
    mtimeMs: number;
}

@injectable()
export class SkillInstallBackendServiceImpl implements SkillInstallBackendService, Disposable {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(RequestService)
    protected readonly requestService: RequestService;

    protected readonly clients = new Set<SkillInstallClient>();
    protected subscription: AsyncSubscription | undefined;
    protected watching = false;
    protected notifyTimeout: ReturnType<typeof setTimeout> | undefined;

    /** Caches each skill folder's content hash keyed on a cheap stat signature, so drift detection avoids re-reading unchanged files. */
    protected readonly hashCache = new Map<string, { signature: string; contentHash: string }>();

    /** Registers a frontend client and starts watching `~/.agents/skills` for external changes. */
    setClient(client: SkillInstallClient | undefined): void {
        if (!client) {
            return;
        }
        this.clients.add(client);
        this.ensureWatching();
    }

    /** Removes a disconnected client and stops the watcher once no clients remain. */
    disconnectClient(client: SkillInstallClient): void {
        this.clients.delete(client);
        if (this.clients.size === 0) {
            this.stopWatching();
        }
    }

    dispose(): void {
        this.clients.clear();
        this.stopWatching();
    }

    async install(entry: ResolvedSkillEntry): Promise<void> {
        const target = this.skillDir(entry.name);
        if (await this.exists(target)) {
            throw new Error(`A skill folder named "${entry.name}" already exists. Use Update or Fix Skill instead.`);
        }
        const files = await this.download(entry);
        this.validateSkill(entry, files);
        await this.writeSkill(entry, files);
    }

    async update(entry: ResolvedSkillEntry): Promise<void> {
        await this.cleanReplace(entry);
    }

    async fixSkill(entry: ResolvedSkillEntry): Promise<void> {
        await this.cleanReplace(entry);
    }

    async link(entry: ResolvedSkillEntry): Promise<void> {
        const target = this.skillDir(entry.name);
        if (!await this.exists(target)) {
            throw new Error(`No local skill folder named "${entry.name}" to link.`);
        }
        await this.writeSidecar(target, entry.skillId, entry.contentHash);
    }

    async unlink(name: string): Promise<void> {
        const sidecar = path.join(this.skillDir(name), SIDECAR_FILE);
        if (await this.exists(sidecar)) {
            await fs.rm(sidecar, { force: true });
        }
    }

    async uninstall(name: string): Promise<void> {
        const target = this.skillDir(name);
        // Only delete folders we manage - a folder without our sidecar may be a
        // hand-placed skill the user does not want us to remove.
        if (!await this.exists(path.join(target, SIDECAR_FILE))) {
            return;
        }
        await fs.rm(target, { recursive: true, force: true });
    }

    async listInstalledSkills(): Promise<InstalledSkillInfo[]> {
        const root = this.skillsRoot();
        if (!await this.exists(root)) {
            this.hashCache.clear();
            return [];
        }
        const dirents = await fs.readdir(root, { withFileTypes: true });
        const result: InstalledSkillInfo[] = [];
        const presentDirs = new Set<string>();
        for (const dirent of dirents) {
            if (!dirent.isDirectory() || dirent.name.startsWith('.')) {
                continue;
            }
            const dir = path.join(root, dirent.name);
            presentDirs.add(dir);
            const sidecar = await this.readSidecar(dir);
            if (sidecar) {
                const onDisk = await this.computeDriftHash(dir);
                result.push({
                    name: dirent.name,
                    skillId: sidecar.skillId,
                    contentHash: sidecar.contentHash,
                    // Drift = on-disk content differs from the registry hash we recorded;
                    // update detection (registry hash changed) is decided by the classifier.
                    drifted: onDisk !== sidecar.contentHash
                });
            } else {
                result.push({ name: dirent.name, drifted: false });
            }
        }
        // Drop cached drift hashes for folders that no longer exist so the cache cannot grow
        // unbounded across many install/uninstall cycles.
        for (const cachedDir of this.hashCache.keys()) {
            if (!presentDirs.has(cachedDir)) {
                this.hashCache.delete(cachedDir);
            }
        }
        return result;
    }

    /** Delete the existing folder (if any) and re-download fresh registry content. */
    protected async cleanReplace(entry: ResolvedSkillEntry): Promise<void> {
        const target = this.skillDir(entry.name);
        // Only clean-replace folders we manage; refuse to clobber a hand-placed folder that
        // exists but carries no sidecar (it must be adopted via Link first).
        if (await this.exists(target) && !await this.exists(path.join(target, SIDECAR_FILE))) {
            throw new Error(`The skill folder "${entry.name}" is not managed by the registry. Link it first, then Update.`);
        }
        const files = await this.download(entry);
        this.validateSkill(entry, files);
        await this.writeSkill(entry, files);
    }

    /**
     * Writes a freshly-downloaded skill plus its sidecar into a sibling temp folder and
     * then atomically swaps it into place, so an interrupted download never leaves a
     * partially-written skill folder behind.
     */
    protected async writeSkill(entry: ResolvedSkillEntry, files: SkillFileContent[]): Promise<void> {
        const root = this.skillsRoot();
        await fs.mkdir(root, { recursive: true });
        const target = this.skillDir(entry.name);
        const staging = path.join(root, `.installing-${entry.name}-${Date.now()}`);
        try {
            for (const file of files) {
                const segments = file.relativePath.split('/');
                if (segments.some(segment => segment === '' || segment === '.' || segment === '..' || segment.includes('\\'))) {
                    throw new Error(`Refusing to write skill file with an unsafe path: "${file.relativePath}".`);
                }
                const dest = path.join(staging, ...segments);
                await fs.mkdir(path.dirname(dest), { recursive: true });
                await fs.writeFile(dest, Buffer.from(file.content));
            }
            await this.writeSidecarFile(path.join(staging, SIDECAR_FILE), entry.skillId, entry.contentHash);
            await fs.rm(target, { recursive: true, force: true });
            await fs.rename(staging, target);
        } catch (error) {
            await fs.rm(staging, { recursive: true, force: true });
            throw error;
        }
    }

    protected validateSkill(entry: ResolvedSkillEntry, files: SkillFileContent[]): void {
        const manifest = files.find(file => file.relativePath === SKILL_MANIFEST);
        if (!manifest) {
            throw new Error(`Skill "${entry.name}" has no ${SKILL_MANIFEST} at ${entry.sourcePath ?? 'the repository root'}.`);
        }
        const declaredName = this.extractFrontmatterName(new TextDecoder().decode(manifest.content));
        if (declaredName !== undefined && declaredName !== entry.name) {
            throw new Error(`Skill name mismatch: registry entry is "${entry.name}" but ${SKILL_MANIFEST} declares "${declaredName}".`);
        }
    }

    /** Extracts the `name` field from a leading YAML frontmatter block, if present. */
    protected extractFrontmatterName(content: string): string | undefined {
        const match = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content);
        if (!match) {
            return undefined;
        }
        const line = match[1].split(/\r?\n/).find(entry => /^\s*name\s*:/.test(entry));
        if (!line) {
            return undefined;
        }
        return line.replace(/^\s*name\s*:/, '').trim().replace(/^['"]|['"]$/g, '');
    }

    protected async download(entry: ResolvedSkillEntry): Promise<SkillFileContent[]> {
        const { owner, repo } = this.parseGitHub(entry.sourceUrl);
        const token = this.resolveToken();
        return this.downloadDir(owner, repo, entry.sourcePath ?? '', '', token);
    }

    protected async downloadDir(owner: string, repo: string, repoPath: string, relativeBase: string, token?: string): Promise<SkillFileContent[]> {
        const suffix = this.encodePath(repoPath);
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents${suffix ? '/' + suffix : ''}`;
        const items = await this.githubJson(apiUrl, token);
        if (!Array.isArray(items)) {
            throw new Error(`Expected a directory at ${repoPath || 'the repository root'} of ${owner}/${repo}.`);
        }
        const files: SkillFileContent[] = [];
        for (const item of items as GitHubContentItem[]) {
            const rel = relativeBase ? `${relativeBase}/${item.name}` : item.name;
            if (item.type === 'dir') {
                files.push(...await this.downloadDir(owner, repo, item.path, rel, token));
            } else if (item.type === 'file' && item.download_url) {
                files.push({ relativePath: rel, content: await this.downloadRaw(item.download_url, token) });
            }
        }
        return files;
    }

    protected parseGitHub(sourceUrl: string): { owner: string; repo: string } {
        let url: URL;
        try {
            url = new URL(sourceUrl);
        } catch {
            throw new Error(`Invalid skill source URL: ${sourceUrl}`);
        }
        if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
            throw new Error(`Only GitHub skill sources are supported; "${url.hostname}" is not GitHub.`);
        }
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 2) {
            throw new Error(`Cannot determine owner/repo from skill source URL: ${sourceUrl}`);
        }
        return { owner: segments[0], repo: segments[1].replace(/\.git$/, '') };
    }

    protected encodePath(repoPath: string): string {
        return repoPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    }

    protected async githubJson(url: string, token?: string): Promise<unknown> {
        const context = await this.requestService.request({
            url,
            headers: this.headers(token, 'application/vnd.github+json')
        });
        if (!RequestContext.isSuccess(context)) {
            throw new Error(`GitHub API request failed (${url}): HTTP ${context.res.statusCode ?? 'unknown'}`);
        }
        return RequestContext.asJson(context);
    }

    protected async downloadRaw(url: string, token?: string): Promise<Uint8Array> {
        const context = await this.requestService.request({ url, headers: this.headers(token) });
        if (!RequestContext.isSuccess(context)) {
            throw new Error(`Failed to download skill file (${url}): HTTP ${context.res.statusCode ?? 'unknown'}`);
        }
        return this.toBytes(context);
    }

    protected headers(token?: string, accept?: string): Headers {
        const headers: Headers = { 'User-Agent': USER_AGENT };
        if (accept) {
            headers['Accept'] = accept;
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    protected toBytes(context: RequestContext): Uint8Array {
        // The backend's NodeRequestService returns raw bytes; the string branch only
        // applies to the compressed (base64) form used when a context crosses the RPC wire.
        const buffer = context.buffer;
        return typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : buffer;
    }

    /** Preference value (trimmed) when set, otherwise `GITHUB_TOKEN` from the environment. */
    protected resolveToken(): string | undefined {
        const fromPreference = this.preferenceService.get<string>(GITHUB_TOKEN_PREF, undefined)?.trim();
        const token = fromPreference || process.env.GITHUB_TOKEN?.trim();
        return token || undefined;
    }

    /**
     * Content hash of a skill folder, reusing the cached result while the folder's file
     * stats (size + mtime of the hash-relevant files) are unchanged. Any install, update,
     * fix, or external edit changes those stats and invalidates the cache automatically.
     *
     * A single recursive traversal collects the stats that form the cheap drift signature;
     * the file contents are read (and hashed) only on a cache miss, so an unchanged folder
     * is walked once and never re-read.
     */
    protected async computeDriftHash(dir: string): Promise<string> {
        const stats = await this.readSkillStats(dir);
        const signature = stats
            .map(stat => `${stat.relativePath}:${stat.size}:${stat.mtimeMs}`)
            .sort()
            .join('|');
        const cached = this.hashCache.get(dir);
        if (cached && cached.signature === signature) {
            return cached.contentHash;
        }
        const files: SkillFileContent[] = await Promise.all(stats.map(async stat =>
            ({ relativePath: stat.relativePath, content: await fs.readFile(stat.full) })));
        const contentHash = computeSkillContentHash(files);
        this.hashCache.set(dir, { signature, contentHash });
        return contentHash;
    }

    /**
     * Single recursive traversal of the hash-relevant files under `dir`, capturing each
     * file's POSIX relative path, absolute path, size and mtime. Dot-prefixed entries are
     * skipped at every level, matching {@link computeSkillContentHash}.
     */
    protected async readSkillStats(dir: string, relativeBase: string = ''): Promise<SkillStatEntry[]> {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        const entries: SkillStatEntry[] = [];
        for (const dirent of dirents) {
            if (dirent.name.startsWith('.')) {
                continue;
            }
            const rel = relativeBase ? `${relativeBase}/${dirent.name}` : dirent.name;
            const full = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                entries.push(...await this.readSkillStats(full, rel));
            } else if (dirent.isFile()) {
                const stat = await fs.stat(full);
                entries.push({ relativePath: rel, full, size: stat.size, mtimeMs: stat.mtimeMs });
            }
        }
        return entries;
    }

    protected async readSidecar(dir: string): Promise<SkillSidecar | undefined> {
        const sidecarPath = path.join(dir, SIDECAR_FILE);
        try {
            const raw = await fs.readFile(sidecarPath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<SkillSidecar>;
            if (typeof parsed.skillId === 'string' && typeof parsed.contentHash === 'string') {
                return { skillId: parsed.skillId, contentHash: parsed.contentHash, installedAt: parsed.installedAt ?? '' };
            }
        } catch {
            // Missing or malformed sidecar - treat as not registry-managed.
        }
        return undefined;
    }

    protected async writeSidecar(dir: string, skillId: string, contentHash: string): Promise<void> {
        await this.writeSidecarFile(path.join(dir, SIDECAR_FILE), skillId, contentHash);
    }

    protected async writeSidecarFile(sidecarPath: string, skillId: string, contentHash: string): Promise<void> {
        const sidecar: SkillSidecar = { skillId, contentHash, installedAt: new Date().toISOString() };
        await fs.writeFile(sidecarPath, JSON.stringify(sidecar, undefined, 2));
    }

    /**
     * Lazily starts a debounced recursive watch on `~/.agents/skills`, notifying clients on
     * change. Uses `@parcel/watcher` (the same backend as Theia's filesystem watcher) so
     * additions and removals - including bare directory deletions - are reported reliably
     * across platforms.
     */
    protected ensureWatching(): void {
        if (this.watching) {
            return;
        }
        this.watching = true;
        const root = this.skillsRoot();
        fs.mkdir(root, { recursive: true })
            .then(() => subscribe(root, (error, events) => {
                if (error) {
                    console.warn('Stopped watching the skills directory after a watcher error.', error);
                    this.stopWatching();
                    this.notifyWatcherStopped();
                    return;
                }
                if (events.length > 0) {
                    this.scheduleNotify();
                }
            }))
            .then(subscription => {
                // A disconnect (stopWatching) or a concurrent ensureWatching may have run
                // while the subscription was pending; tear it down if we were superseded so
                // we never leak an orphaned watcher.
                if (!this.watching || this.subscription) {
                    subscription.unsubscribe();
                    return;
                }
                this.subscription = subscription;
            })
            .catch(error => {
                this.watching = false;
                console.warn('Could not watch the skills directory for changes.', error);
            });
    }

    protected stopWatching(): void {
        this.watching = false;
        if (this.notifyTimeout) {
            clearTimeout(this.notifyTimeout);
            this.notifyTimeout = undefined;
        }
        this.subscription?.unsubscribe();
        this.subscription = undefined;
    }

    protected scheduleNotify(): void {
        if (this.notifyTimeout) {
            clearTimeout(this.notifyTimeout);
        }
        this.notifyTimeout = setTimeout(() => {
            this.notifyTimeout = undefined;
            for (const client of this.clients) {
                client.notifyDidChangeInstalledSkills();
            }
        }, WATCH_DEBOUNCE_MS);
    }

    /** Tells every connected client that the watcher stopped, so the UI can prompt a reload. */
    protected notifyWatcherStopped(): void {
        for (const client of this.clients) {
            client.notifyWatcherStopped();
        }
    }

    protected skillsRoot(): string {
        return path.join(os.homedir(), '.agents', 'skills');
    }

    protected skillDir(name: string): string {
        this.assertValidSkillName(name);
        return path.join(this.skillsRoot(), name);
    }

    /**
     * Rejects skill names that are not a single, safe path segment. The name originates from
     * registry JSON, so guarding here prevents a `..` or separator from escaping the skills
     * root when it is joined into a filesystem path.
     */
    protected assertValidSkillName(name: string): void {
        if (!name || name === '.' || name === '..' || /[/\\]/.test(name) || path.isAbsolute(name)) {
            throw new Error(`Invalid skill name "${name}": a skill name must be a single path segment without separators.`);
        }
    }

    protected async exists(target: string): Promise<boolean> {
        try {
            await fs.stat(target);
            return true;
        } catch {
            return false;
        }
    }
}
