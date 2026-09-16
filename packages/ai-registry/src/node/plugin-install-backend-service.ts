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

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AsyncSubscription, subscribe } from '@theia/core/shared/@parcel/watcher';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, ILogger, nls } from '@theia/core';
import { computeContentHash, FileContent } from '../common/content-hash';
import { AgentPluginManifest, AgentPluginManifestReader, AgentPluginRejectedError, SkippedPluginComponent } from '../common/plugin/agent-plugin-manifest';
import { PluginDirectoryNaming } from '../common/plugin/plugin-directory-naming';
import { PluginInstallBackendService, PluginInstallClient } from '../common/plugin/plugin-install-protocol';
import { InstalledPluginInfo, PluginRegistryMetadata, ResolvedPluginEntry, StagedPluginInstall } from '../common/plugin/plugin-registry-types';
import { GitHubTarballSource } from './github-tarball-source';

/** Dot-prefixed so it is excluded from the content hash. */
const REGISTRY_METADATA_FILE = '.registry.json';
const STAGING_PREFIX = '.installing-';
/** Fixed component locations of the specification; none of them is configurable. */
const PLUGIN_MANIFEST = 'plugin.json';
const MCP_CONFIG = 'mcp.json';
const SKILLS_DIRECTORY = 'skills';
const SKILL_MANIFEST = 'SKILL.md';
/** Quiet period (ms) collapsing a burst of filesystem events into one notification. */
const WATCH_DEBOUNCE_MS = 300;

/** A verified download waiting for the frontend to commit or discard it. */
interface StagedDownload {
    entry: ResolvedPluginEntry;
    stagingDirectory: string;
    directoryName: string;
    /** The hash we computed over the extracted tree - the one that gets recorded. */
    contentHash: string;
}

interface PluginStatEntry {
    relativePath: string;
    full: string;
    size: number;
    mtimeMs: number;
}

@injectable()
export class PluginInstallBackendServiceImpl implements PluginInstallBackendService, Disposable {

    @inject(GitHubTarballSource)
    protected readonly tarballSource: GitHubTarballSource;

    @inject(AgentPluginManifestReader)
    protected readonly manifestReader: AgentPluginManifestReader;

    @inject(PluginDirectoryNaming)
    protected readonly directoryNaming: PluginDirectoryNaming;

    @inject(ILogger) @named('ai-registry:PluginInstallBackendServiceImpl')
    protected readonly logger: ILogger;

    protected readonly clients = new Set<PluginInstallClient>();
    protected subscription: AsyncSubscription | undefined;
    protected watching = false;
    protected notifyTimeout: ReturnType<typeof setTimeout> | undefined;

    protected readonly staged = new Map<string, StagedDownload>();

    /** Disambiguates two staging directories created within the same millisecond. */
    protected stagingCounter = 0;

    /** Content hash per root, keyed on a stat signature, so drift detection skips unchanged files. */
    protected readonly hashCache = new Map<string, { signature: string; contentHash: string }>();

    @postConstruct()
    protected init(): void {
        this.sweepStagingFolders().catch(error => this.logger.warn('Could not sweep stale plugin staging folders at startup.', error));
    }

    setClient(client: PluginInstallClient | undefined): void {
        if (!client) {
            return;
        }
        this.clients.add(client);
        this.ensureWatching();
    }

    disconnectClient(client: PluginInstallClient): void {
        this.clients.delete(client);
        if (this.clients.size === 0) {
            this.stopWatching();
        }
    }

    dispose(): void {
        this.clients.clear();
        this.stopWatching();
    }

    async getPluginsRoot(): Promise<string> {
        return this.pluginsRoot();
    }

    /**
     * A hash mismatch is reported rather than thrown - the user decides - while a missing or invalid
     * `plugin.json` throws. The staging directory is removed again if anything fails, so a partial
     * download never survives.
     */
    async stage(entry: ResolvedPluginEntry): Promise<StagedPluginInstall> {
        const directoryName = this.directoryNaming.directoryName(entry.pluginId);
        const root = this.pluginsRoot();
        await fs.mkdir(root, { recursive: true });
        const stagingId = `${STAGING_PREFIX}${directoryName}-${Date.now()}-${this.stagingCounter++}`;
        const stagingDirectory = path.join(root, stagingId);
        try {
            await fs.mkdir(stagingDirectory, { recursive: true });
            await this.tarballSource.fetch({
                sourceUrl: entry.sourceUrl,
                ...(entry.sourcePath !== undefined && { sourcePath: entry.sourcePath }),
                destination: stagingDirectory
            });
            const manifestText = await this.readTextFile(path.join(stagingDirectory, PLUGIN_MANIFEST));
            if (manifestText === undefined) {
                throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestMissing',
                    'The plugin "{0}" has no "{1}" at {2}.', entry.name, PLUGIN_MANIFEST, entry.sourcePath ?? 'the repository root'));
            }
            this.manifestReader.parseManifest(manifestText);
            const contentHash = await this.computeTreeHash(stagingDirectory);
            this.staged.set(stagingId, {
                entry,
                stagingDirectory,
                directoryName,
                contentHash
            });
            return {
                stagingId,
                ...(contentHash !== entry.contentHash && {
                    mismatch: { expected: entry.contentHash, actual: contentHash }
                })
            };
        } catch (error) {
            this.staged.delete(stagingId);
            await fs.rm(stagingDirectory, { recursive: true, force: true });
            throw error;
        }
    }

    /**
     * The data directory is created here and never removed on update: the specification makes creating
     * it a MUST before any plugin subprocess launches, and requires its contents to survive an update.
     */
    async commit(stagingId: string, replaceExisting: boolean): Promise<InstalledPluginInfo> {
        const staged = this.staged.get(stagingId);
        if (!staged) {
            throw new Error(nls.localize('theia/ai-registry/plugin/stagingGone',
                'The staged plugin download is no longer available. Please install the plugin again.'));
        }
        const target = path.join(this.pluginsRoot(), staged.directoryName);
        try {
            await this.writeRegistryMetadataFile(path.join(staged.stagingDirectory, REGISTRY_METADATA_FILE), {
                pluginId: staged.entry.pluginId,
                contentHash: staged.entry.contentHash,
                qualifier: await this.chooseQualifier(staged.entry.pluginId, staged.directoryName)
            });
            if (replaceExisting) {
                // Only the plugin root is replaced. The data directory below is deliberately untouched.
                await fs.rm(target, { recursive: true, force: true });
            } else if (await this.exists(target)) {
                // `rename` onto a non-empty directory fails with a raw ENOTEMPTY naming the user's home
                // directory. Say what actually happened instead, and what to do about it.
                throw new Error(nls.localize('theia/ai-registry/plugin/alreadyInstalled',
                    'The Agent Plugin "{0}" is already installed at "{1}". Use Update on the installed plugin to replace it.',
                    staged.entry.name, staged.directoryName));
            }
            await fs.rename(staged.stagingDirectory, target);
        } finally {
            this.staged.delete(stagingId);
            await fs.rm(staged.stagingDirectory, { recursive: true, force: true });
        }
        await fs.mkdir(this.pluginDataDirectory(staged.directoryName), { recursive: true });
        return this.prepareForLaunch(await this.describeInstalledPlugin(staged.directoryName));
    }

    async discard(stagingId: string): Promise<void> {
        const staged = this.staged.get(stagingId);
        if (!staged) {
            return;
        }
        this.staged.delete(stagingId);
        await fs.rm(staged.stagingDirectory, { recursive: true, force: true });
    }

    /**
     * Only directories carrying our provenance marker are removed: one without it may be the user's.
     * Deleting the data directory is permitted on uninstall, unlike on update.
     */
    async uninstall(pluginId: string): Promise<void> {
        const directoryName = await this.findManagedDirectory(pluginId);
        if (!directoryName) {
            return;
        }
        await fs.rm(path.join(this.pluginsRoot(), directoryName), { recursive: true, force: true });
        await fs.rm(this.pluginDataDirectory(directoryName), { recursive: true, force: true });
    }

    /**
     * Writes only the provenance marker, touching no file the plugin owns. Only the canonical directory
     * name may be adopted: every other operation derives its target from the plugin identifier, so
     * adopting another name would let an update create a second directory beside the adopted one.
     *
     * Ends in launching a subprocess exactly like {@link commit}, so it carries the same obligations.
     */
    async link(entry: ResolvedPluginEntry, directoryName: string): Promise<InstalledPluginInfo> {
        const expected = this.directoryNaming.directoryName(entry.pluginId);
        if (directoryName !== expected) {
            throw new Error(nls.localize('theia/ai-registry/plugin/linkNameMismatch',
                'The Agent Plugin "{0}" can only be linked to a directory named "{1}", not to "{2}".', entry.name, expected, directoryName));
        }
        const target = path.join(this.pluginsRoot(), expected);
        if (!await this.exists(target)) {
            throw new Error(nls.localize('theia/ai-registry/plugin/linkTargetMissing',
                'There is no local plugin directory named "{0}" to link.', directoryName));
        }
        await this.writeRegistryMetadataFile(path.join(target, REGISTRY_METADATA_FILE), {
            pluginId: entry.pluginId,
            contentHash: entry.contentHash,
            qualifier: await this.chooseQualifier(entry.pluginId, expected)
        });
        await fs.mkdir(this.pluginDataDirectory(expected), { recursive: true });
        return this.prepareForLaunch(await this.describeInstalledPlugin(expected));
    }

    async unlink(pluginId: string): Promise<void> {
        const directoryName = await this.findManagedDirectory(pluginId);
        if (!directoryName) {
            return;
        }
        await fs.rm(path.join(this.pluginsRoot(), directoryName, REGISTRY_METADATA_FILE), { force: true });
    }

    async listInstalledPlugins(): Promise<InstalledPluginInfo[]> {
        const root = this.pluginsRoot();
        if (!await this.exists(root)) {
            this.hashCache.clear();
            return [];
        }
        const dirents = await fs.readdir(root, { withFileTypes: true });
        const result: InstalledPluginInfo[] = [];
        const presentDirs = new Set<string>();
        for (const dirent of dirents) {
            // Dot-prefixed entries are ours (staging directories) or the user's; neither is a plugin.
            if (!dirent.isDirectory() || dirent.name.startsWith('.')) {
                continue;
            }
            presentDirs.add(path.join(root, dirent.name));
            result.push(await this.describeInstalledPlugin(dirent.name));
        }
        // Drop cached hashes for directories that are gone, so the cache cannot grow unbounded.
        for (const cachedDir of this.hashCache.keys()) {
            if (!presentDirs.has(cachedDir)) {
                this.hashCache.delete(cachedDir);
            }
        }
        return result;
    }

    /**
     * Failures are isolated at the narrowest boundary the specification defines: an invalid
     * `plugin.json` leaves the directory without components, an invalid `mcp.json` only disables MCP,
     * and a single invalid server or skill is skipped.
     */
    protected async describeInstalledPlugin(directoryName: string): Promise<InstalledPluginInfo> {
        const root = path.join(this.pluginsRoot(), directoryName);
        const metadata = await this.readRegistryMetadata(root);
        const skipped: SkippedPluginComponent[] = [];
        const info: InstalledPluginInfo = {
            directoryName,
            root,
            dataRoot: this.pluginDataDirectory(directoryName),
            drifted: false,
            skills: [],
            servers: [],
            skipped
        };
        if (metadata) {
            info.pluginId = metadata.pluginId;
            info.contentHash = metadata.contentHash;
            info.qualifier = metadata.qualifier;
            info.installedAt = metadata.installedAt;
            // Drift is local divergence only; update detection is the frontend classifier's job.
            info.drifted = await this.computeDriftHash(root) !== metadata.contentHash;
        }
        const manifest = await this.readManifest(root, skipped);
        if (!manifest) {
            return info;
        }
        info.name = manifest.name;
        info.version = manifest.version;
        const mcp = await this.readMcpConfig(root);
        if (mcp.mcpDisabledReason !== undefined) {
            info.mcpDisabledReason = mcp.mcpDisabledReason;
        } else {
            const components = this.manifestReader.resolveComponents({
                ...mcp,
                manifestSchema: manifest.schema,
                pluginRoot: root,
                pluginData: info.dataRoot
            });
            info.servers = components.servers;
            info.mcpDisabledReason = components.mcpDisabledReason;
            skipped.push(...components.skipped);
        }
        info.skills = await this.discoverSkills(root, skipped);
        return info;
    }

    /** Reports rather than throws: a bad manifest on disk shows the plugin without components. */
    protected async readManifest(root: string, skipped: SkippedPluginComponent[]): Promise<AgentPluginManifest | undefined> {
        const manifestText = await this.readTextFile(path.join(root, PLUGIN_MANIFEST));
        if (manifestText === undefined) {
            skipped.push({
                name: PLUGIN_MANIFEST,
                reason: nls.localize('theia/ai-registry/plugin/manifestUnreadable', 'The plugin has no readable "{0}".', PLUGIN_MANIFEST)
            });
            return undefined;
        }
        try {
            const manifest = this.manifestReader.parseManifest(manifestText);
            // The only channel we have for the two non-fatal problems the spec makes us report.
            skipped.push(...manifest.warnings.map(warning => ({ name: PLUGIN_MANIFEST, reason: warning })));
            return manifest;
        } catch (error) {
            skipped.push({ name: PLUGIN_MANIFEST, reason: this.reason(error) });
            return undefined;
        }
    }

    /**
     * An absent `mcp.json` is not an error. One that is not a regular file, or resolves outside the
     * plugin root, invalidates the MCP component type without touching the others.
     */
    protected async readMcpConfig(root: string): Promise<{ mcpJsonText?: string; mcpDisabledReason?: string }> {
        const mcpPath = path.join(root, MCP_CONFIG);
        const stat = await this.statOrUndefined(mcpPath);
        if (!stat) {
            return {};
        }
        if (!stat.isFile()) {
            return { mcpDisabledReason: nls.localize('theia/ai-registry/plugin/mcpNotAFile', '"{0}" is not a regular file.', MCP_CONFIG) };
        }
        if (!await this.resolvesInside(mcpPath, root)) {
            return {
                mcpDisabledReason: nls.localize('theia/ai-registry/plugin/mcpEscapesRoot',
                    '"{0}" resolves outside the plugin directory.', MCP_CONFIG)
            };
        }
        const mcpJsonText = await this.readTextFile(mcpPath);
        return mcpJsonText === undefined
            ? { mcpDisabledReason: nls.localize('theia/ai-registry/plugin/mcpUnreadable', '"{0}" could not be read.', MCP_CONFIG) }
            : { mcpJsonText };
    }

    /**
     * Immediate children of `skills/` only, never recursive. A directory without a `SKILL.md` is simply
     * not a skill and is not reported.
     *
     * @returns the names sorted, so a card rendered from this does not reshuffle between scans.
     */
    protected async discoverSkills(root: string, skipped: SkippedPluginComponent[]): Promise<string[]> {
        const skillsPath = path.join(root, SKILLS_DIRECTORY);
        const stat = await this.statOrUndefined(skillsPath);
        if (!stat) {
            return [];
        }
        if (!stat.isDirectory()) {
            skipped.push({
                name: SKILLS_DIRECTORY,
                reason: nls.localize('theia/ai-registry/plugin/skillsNotADirectory', '"{0}" is not a directory.', SKILLS_DIRECTORY)
            });
            return [];
        }
        if (!await this.resolvesInside(skillsPath, root)) {
            skipped.push({
                name: SKILLS_DIRECTORY,
                reason: nls.localize('theia/ai-registry/plugin/skillsEscapeRoot', '"{0}" resolves outside the plugin directory.', SKILLS_DIRECTORY)
            });
            return [];
        }
        const skills: string[] = [];
        for (const dirent of await fs.readdir(skillsPath, { withFileTypes: true })) {
            const skillDirectory = path.join(skillsPath, dirent.name);
            if (!(await this.statOrUndefined(skillDirectory))?.isDirectory()) {
                continue;
            }
            const manifestPath = path.join(skillDirectory, SKILL_MANIFEST);
            // stat, not lstat: a symlink resolving to a regular file inside the plugin root is a skill.
            if (!(await this.statOrUndefined(manifestPath))?.isFile()) {
                continue;
            }
            if (!await this.resolvesInside(manifestPath, root)) {
                skipped.push({
                    name: dirent.name,
                    reason: nls.localize('theia/ai-registry/plugin/skillEscapesRoot',
                        'The skill\'s "{0}" resolves outside the plugin directory.', SKILL_MANIFEST)
                });
                continue;
            }
            skills.push(dirent.name);
        }
        return skills.sort();
    }

    /** True when `target`'s fully resolved path stays inside the resolved `root`. */
    protected async resolvesInside(target: string, root: string): Promise<boolean> {
        try {
            const resolvedRoot = await fs.realpath(root);
            const resolvedTarget = await fs.realpath(target);
            const relative = path.relative(resolvedRoot, resolvedTarget);
            return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        } catch {
            return false;
        }
    }

    /** Read straight from disk, without consulting the drift cache. */
    protected async computeTreeHash(directory: string): Promise<string> {
        const stats = await this.readPluginStats(directory);
        return computeContentHash(await this.readFileContents(stats));
    }

    /**
     * Reuses the cached hash while size and mtime of every hash-relevant file are unchanged, so an
     * unchanged root is walked once and never re-read.
     */
    protected async computeDriftHash(directory: string): Promise<string> {
        const stats = await this.readPluginStats(directory);
        const signature = stats
            .map(stat => `${stat.relativePath}:${stat.size}:${stat.mtimeMs}`)
            .sort()
            .join('|');
        const cached = this.hashCache.get(directory);
        if (cached && cached.signature === signature) {
            return cached.contentHash;
        }
        const contentHash = computeContentHash(await this.readFileContents(stats));
        this.hashCache.set(directory, { signature, contentHash });
        return contentHash;
    }

    protected async readFileContents(stats: PluginStatEntry[]): Promise<FileContent[]> {
        return Promise.all(stats.map(async stat => ({ relativePath: stat.relativePath, content: await fs.readFile(stat.full) })));
    }

    /**
     * Dot-prefixed entries are skipped at every level, matching {@link computeContentHash} - which is
     * what excludes our own `.registry.json`.
     */
    protected async readPluginStats(directory: string, relativeBase: string = ''): Promise<PluginStatEntry[]> {
        const dirents = await fs.readdir(directory, { withFileTypes: true });
        const entries: PluginStatEntry[] = [];
        for (const dirent of dirents) {
            if (dirent.name.startsWith('.')) {
                continue;
            }
            const rel = relativeBase ? `${relativeBase}/${dirent.name}` : dirent.name;
            const full = path.join(directory, dirent.name);
            if (dirent.isDirectory()) {
                entries.push(...await this.readPluginStats(full, rel));
            } else if (dirent.isFile()) {
                const stat = await fs.stat(full);
                entries.push({ relativePath: rel, full, size: stat.size, mtimeMs: stat.mtimeMs });
            }
        }
        return entries;
    }

    /**
     * A subprocess cannot create its own `cwd`, and the manifest reader never touches the filesystem,
     * so the `${PLUGIN_DATA}`-rooted ones are created here. A `cwd` under the plugin root ships with
     * the plugin: inventing it would hide a broken plugin. Best-effort, so one bad server does not
     * fail the install.
     */
    protected async prepareForLaunch(info: InstalledPluginInfo): Promise<InstalledPluginInfo> {
        for (const server of info.servers) {
            if (server.kind !== 'stdio' || !this.isInside(server.cwd, info.dataRoot)) {
                continue;
            }
            try {
                await fs.mkdir(server.cwd, { recursive: true });
            } catch (error) {
                this.logger.warn(`Could not create the working directory "${server.cwd}" of plugin server "${server.name}".`, error);
            }
        }
        return info;
    }

    protected isInside(target: string, root: string): boolean {
        const relative = path.relative(root, target);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }

    /** The marker is the only evidence of ownership there is, so this scans for it. */
    protected async findManagedDirectory(pluginId: string): Promise<string | undefined> {
        const root = this.pluginsRoot();
        if (!await this.exists(root)) {
            return undefined;
        }
        for (const dirent of await fs.readdir(root, { withFileTypes: true })) {
            if (!dirent.isDirectory() || dirent.name.startsWith('.')) {
                continue;
            }
            const metadata = await this.readRegistryMetadata(path.join(root, dirent.name));
            if (metadata?.pluginId === pluginId) {
                return dirent.name;
            }
        }
        return undefined;
    }

    /**
     * The last segment of the identifier while no other installed plugin has claimed it, and the
     * directory name otherwise. First come, first served, and recorded rather than derived: a plugin
     * installed later must never rename the skills of one that is already there, and an update of
     * this plugin must not rename its own.
     */
    protected async chooseQualifier(pluginId: string, directoryName: string): Promise<string> {
        const existing = (await this.readRegistryMetadata(path.join(this.pluginsRoot(), directoryName)))?.qualifier;
        if (existing !== undefined) {
            return existing;
        }
        const short = pluginId.substring(pluginId.lastIndexOf('/') + 1);
        if (!short || short === directoryName) {
            return directoryName;
        }
        return (await this.claimedQualifiers(directoryName)).has(short) ? directoryName : short;
    }

    /**
     * Qualifiers of every managed plugin other than `exceptDirectory`, read from the markers alone -
     * `listInstalledPlugins` would walk every tree and hash it just to answer this.
     */
    protected async claimedQualifiers(exceptDirectory: string): Promise<Set<string>> {
        const root = this.pluginsRoot();
        if (!await this.exists(root)) {
            return new Set();
        }
        const claimed = new Set<string>();
        for (const dirent of await fs.readdir(root, { withFileTypes: true })) {
            if (!dirent.isDirectory() || dirent.name.startsWith('.') || dirent.name === exceptDirectory) {
                continue;
            }
            const metadata = await this.readRegistryMetadata(path.join(root, dirent.name));
            if (metadata) {
                claimed.add(metadata.qualifier);
            }
        }
        return claimed;
    }

    protected async readRegistryMetadata(directory: string): Promise<PluginRegistryMetadata | undefined> {
        try {
            const raw = await fs.readFile(path.join(directory, REGISTRY_METADATA_FILE), 'utf8');
            const parsed = JSON.parse(raw) as Partial<PluginRegistryMetadata>;
            if (typeof parsed.pluginId === 'string' && typeof parsed.contentHash === 'string') {
                return {
                    pluginId: parsed.pluginId,
                    contentHash: parsed.contentHash,
                    // A marker written before qualifiers were recorded falls back to the directory
                    // name, which is what its skills were qualified with at the time.
                    qualifier: parsed.qualifier ?? path.basename(directory),
                    installedAt: parsed.installedAt
                };
            }
        } catch {
            // Missing or malformed - treat as not registry-managed.
        }
        return undefined;
    }

    protected async writeRegistryMetadataFile(metadataPath: string, metadata: Omit<PluginRegistryMetadata, 'installedAt'>): Promise<void> {
        const written: PluginRegistryMetadata = {
            pluginId: metadata.pluginId,
            contentHash: metadata.contentHash,
            qualifier: metadata.qualifier,
            // Tells the MCP layer the code behind a running server was replaced, even when the
            // server's own configuration did not change - see `connectionDescription`.
            installedAt: new Date().toISOString()
        };
        await fs.writeFile(metadataPath, JSON.stringify(written, undefined, 2));
    }

    /** `@parcel/watcher` reports bare directory deletions reliably across platforms; `fs.watch` does not. */
    protected ensureWatching(): void {
        if (this.watching) {
            return;
        }
        this.watching = true;
        const root = this.pluginsRoot();
        fs.mkdir(root, { recursive: true })
            .then(() => subscribe(root, (error, events) => {
                if (error) {
                    this.logger.warn('Stopped watching the plugins directory after a watcher error.', error);
                    this.stopWatching();
                    this.notifyWatcherStopped();
                    return;
                }
                if (events.length > 0) {
                    this.scheduleNotify();
                }
            }))
            .then(subscription => {
                // Superseded while the subscription was pending - do not leak an orphaned watcher.
                if (!this.watching || this.subscription) {
                    subscription.unsubscribe();
                    return;
                }
                this.subscription = subscription;
            })
            .catch(error => {
                this.watching = false;
                this.logger.warn('Could not watch the plugins directory for changes.', error);
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
                client.notifyDidChangeInstalledPlugins();
            }
        }, WATCH_DEBOUNCE_MS);
    }

    protected notifyWatcherStopped(): void {
        for (const client of this.clients) {
            client.notifyWatcherStopped();
        }
    }

    /** `protected` so a product can override it; deliberately not a preference. */
    protected pluginsRoot(): string {
        return path.join(os.homedir(), '.agents', 'plugins');
    }

    /**
     * A sibling tree of the plugin roots, so plugin data is never part of a content hash and survives
     * replacing the root.
     */
    protected pluginDataRoot(): string {
        return path.join(os.homedir(), '.agents', 'plugin-data');
    }

    protected pluginDataDirectory(directoryName: string): string {
        return path.join(this.pluginDataRoot(), directoryName);
    }

    protected async readTextFile(target: string): Promise<string | undefined> {
        try {
            return await fs.readFile(target, 'utf8');
        } catch {
            return undefined;
        }
    }

    protected async statOrUndefined(target: string): Promise<{ isFile(): boolean; isDirectory(): boolean } | undefined> {
        try {
            return await fs.stat(target);
        } catch {
            return undefined;
        }
    }

    protected async exists(target: string): Promise<boolean> {
        return await this.statOrUndefined(target) !== undefined;
    }

    protected reason(error: unknown): string {
        return error instanceof Error && error.message
            ? error.message
            : nls.localize('theia/ai-registry/plugin/manifestInvalid', 'The plugin manifest is invalid.');
    }

    /**
     * Same-process failures always clean their own staging directory; this handles the crash case.
     */
    protected async sweepStagingFolders(): Promise<void> {
        const root = this.pluginsRoot();
        if (!await this.exists(root)) {
            return;
        }
        const dirents = await fs.readdir(root, { withFileTypes: true });
        await Promise.all(dirents
            .filter(dirent => dirent.isDirectory() && dirent.name.startsWith(STAGING_PREFIX) && !this.staged.has(dirent.name))
            .map(dirent => fs.rm(path.join(root, dirent.name), { recursive: true, force: true })
                .catch(error => this.logger.warn(`Could not remove stale plugin staging folder "${dirent.name}".`, error))));
    }
}
