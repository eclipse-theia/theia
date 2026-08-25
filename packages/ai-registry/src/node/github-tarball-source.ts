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

import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { extract, ExtractOptions, Headers } from 'tar-fs';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger, nls, PreferenceService } from '@theia/core';
import { Headers as RequestHeaders, RequestContext, RequestService } from '@theia/core/shared/@theia/request';
import { GITHUB_TOKEN_PREF } from '../common/skill/skill-registry-preferences';

const USER_AGENT = 'Theia-AI-Registry';
/** Name given to a mapped entry that must not be written; {@link GitHubTarballSourceImpl} skips it. */
const DROPPED_ENTRY = '';

/**
 * The download runs in the backend, which serves every connected frontend, so an enormous repository
 * or a gzip bomb costs far more than the session that asked for it. The content hash cannot help: it
 * is verified after extraction.
 */
const DEFAULT_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_EXTRACTED_BYTES = 256 * 1024 * 1024;

/** A `tar-stream` header, with the link target the bundled `@types/tar-fs` (written for 1.x) omits. */
interface TarEntryHeader extends Headers {
    linkname?: string | null;
}

interface TarExtractionState {
    /** Entry paths that would have escaped the root: a hostile shape, so one of them fails extraction. */
    unsafe: string[];
    /**
     * Links refused because their target lies outside the plugin - a monorepo's
     * `LICENSE -> ../../LICENSE` is the ordinary case. Nothing would be written outside the root, so
     * these are dropped and reported rather than failing the install.
     */
    droppedLinks: string[];
    /** Symlinks kept so far, so a later link cannot be resolved through one. */
    keptSymlinks: Set<string>;
    fileCount: number;
    /**
     * Entries found inside the requested subtree, of any type - directories and dropped links included.
     * Distinguishes a subtree that is not in the archive at all from one that is there but holds no
     * regular file, which are the same `fileCount` of 0 but not the same thing to tell the user.
     */
    subtreeEntryCount: number;
    byteCount: number;
    tooLarge?: boolean;
}

export interface PluginTarballRequest {
    sourceUrl: string;
    /** Path within the repository pointing at the plugin root. Omitted means the repository root. */
    sourcePath?: string;
    /** Directory the plugin tree is extracted into; it becomes the plugin root. */
    destination: string;
}

export interface ExtractedPluginTree {
    /** Read from the trailing SHA of `<owner>-<repo>-<sha>/`; a pin the registry feed cannot give us. */
    /** So a caller can tell an empty `source.path` subtree from a populated one. */
    fileCount: number;
    /** Links not created because their target lies outside the plugin; empty is the normal case. */
    droppedLinks: string[];
}

export const GitHubTarballSource = Symbol('GitHubTarballSource');
/**
 * A repository tarball is a single request that also carries the commit it was taken from, unlike the
 * Contents API walk the skill installer uses, which needs one request per directory and per file.
 */
export interface GitHubTarballSource {
    /**
     * Strips the archive's top-level directory so the plugin root - `source.path`, or the repository
     * root when omitted - becomes `destination` itself.
     *
     * @throws when the source is not a GitHub repository, the download fails, the archive contains an
     * entry that would escape `destination`, or the requested `source.path` is not in the archive.
     */
    fetch(request: PluginTarballRequest): Promise<ExtractedPluginTree>;
}

@injectable()
export class GitHubTarballSourceImpl implements GitHubTarballSource {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    // The raw RequestService, like the skill installer: this talks to GitHub rather than to the
    // registry host, so the backend request allowlist (which covers the registry only) does not apply.
    @inject(RequestService)
    protected readonly requestService: RequestService;

    @inject(ILogger) @named('ai-registry:GitHubTarballSourceImpl')
    protected readonly logger: ILogger;

    async fetch(request: PluginTarballRequest): Promise<ExtractedPluginTree> {
        const { owner, repo } = this.parseGitHub(request.sourceUrl);
        const archive = await this.downloadTarball(owner, repo);
        return this.extractTarball(archive, request);
    }

    /** One request; the GitHub API redirects to `codeload`, which the request service follows. */
    protected async downloadTarball(owner: string, repo: string): Promise<Uint8Array> {
        const url = `https://api.github.com/repos/${owner}/${repo}/tarball`;
        const context = await this.requestService.request({ url, headers: this.headers(this.resolveToken()) });
        if (!RequestContext.isSuccess(context)) {
            throw new Error(nls.localize('theia/ai-registry/plugin/tarballDownloadFailed',
                'Could not download the plugin source from "{0}": HTTP {1}.', url, String(context.res.statusCode ?? 'unknown')));
        }
        const bytes = this.toBytes(context);
        // After the fact - the request service buffers the whole body - but it still bounds what gets
        // decompressed and written, which is where the amplification is.
        if (bytes.byteLength > this.maxArchiveBytes()) {
            throw new Error(this.tooLarge(url));
        }
        return bytes;
    }

    /** `protected` so a product can change the caps. */
    protected maxArchiveBytes(): number {
        return DEFAULT_MAX_ARCHIVE_BYTES;
    }

    protected maxExtractedBytes(): number {
        return DEFAULT_MAX_EXTRACTED_BYTES;
    }

    /** The one message both caps report, so the user is not told two different things. */
    protected tooLarge(sourceUrl: string): string {
        return nls.localize('theia/ai-registry/plugin/tarballTooLarge',
            'The plugin source at "{0}" is too large to install. An Agent Plugin is expected to be a small tree of '
            + 'configuration, skills and code.', sourceUrl);
    }

    /**
     * Every entry is mapped before anything is written, so a malicious archive cannot write outside the
     * staging directory even partially. Containment here is *lexical* and deliberately so: it runs
     * before extraction, when the tree to resolve against does not exist yet. `tar-fs` performs the
     * real check as it writes, refusing to follow a symlinked parent directory.
     */
    protected async extractTarball(archive: Uint8Array, request: PluginTarballRequest): Promise<ExtractedPluginTree> {
        const destination = path.resolve(request.destination);
        const prefix = this.normalizeSubPath(request.sourcePath);
        const state: TarExtractionState = { unsafe: [], droppedLinks: [], keptSymlinks: new Set(), fileCount: 0, subtreeEntryCount: 0, byteCount: 0 };
        const options: ExtractOptions = {
            map: header => this.mapEntry(header as TarEntryHeader, prefix, destination, state),
            ignore: (_name, header) => !header || header.name === DROPPED_ENTRY,
            // No device nodes or fifos.
            strict: true
        };
        try {
            await pipeline(Readable.from(Buffer.from(archive)), createGunzip(), extract(destination, options));
        } catch (error) {
            throw this.extractionFailed(error, request, state);
        }
        if (state.tooLarge) {
            throw new Error(this.tooLarge(request.sourceUrl));
        }
        if (state.unsafe.length > 0) {
            this.logger.warn(`Refused ${state.unsafe.length} unsafe entries in the plugin archive of ${request.sourceUrl}: ${state.unsafe.join(', ')}`);
            throw new Error(nls.localize('theia/ai-registry/plugin/tarballUnsafeEntry',
                'The plugin archive contains the entry "{0}", which would be written outside the plugin directory.', state.unsafe[0]));
        }
        if (state.fileCount === 0) {
            throw new Error(this.nothingToInstall(request, state));
        }
        if (state.droppedLinks.length > 0) {
            this.logger.info(
                `Did not create ${state.droppedLinks.length} link(s) pointing outside the plugin of ${request.sourceUrl}: ${state.droppedLinks.join(', ')}`);
        }
        return {
            fileCount: state.fileCount,
            droppedLinks: state.droppedLinks
        };
    }

    /**
     * No regular file was written, which has two causes worth telling apart: the requested subtree is not
     * in the archive at all, or it is there and holds only directories and links whose targets were
     * dropped. Reporting the second as a wrong path would send the user hunting for a typo that is not
     * there.
     */
    protected nothingToInstall(request: PluginTarballRequest, state: TarExtractionState): string {
        if (state.subtreeEntryCount > 0) {
            return request.sourcePath
                ? nls.localize('theia/ai-registry/plugin/tarballPathNoFiles',
                    'The plugin path "{0}" in the repository "{1}" holds no file to install, only directories or links pointing outside it.',
                    request.sourcePath, request.sourceUrl)
                : nls.localize('theia/ai-registry/plugin/tarballNoFiles',
                    'The repository "{0}" holds no file to install, only directories or links pointing outside it.', request.sourceUrl);
        }
        return request.sourcePath
            ? nls.localize('theia/ai-registry/plugin/tarballPathMissing',
                'The plugin path "{0}" does not exist in the repository "{1}".', request.sourcePath, request.sourceUrl)
            : nls.localize('theia/ai-registry/plugin/tarballEmpty', 'The repository "{0}" contains no files.', request.sourceUrl);
    }

    /**
     * `tar-fs` reports a refusal to write through a symlinked parent as `<absolute path> is not a valid
     * path`, a raw message naming an internal staging directory. It is a containment refusal like any
     * other, so it is reported like one.
     */
    protected extractionFailed(error: unknown, request: PluginTarballRequest, state: TarExtractionState): Error {
        const message = error instanceof Error ? error.message : String(error);
        if (/is not a valid path/.test(message)) {
            this.logger.warn(`Extraction of the plugin archive of ${request.sourceUrl} was refused by the archive writer: ${message}`);
            return new Error(nls.localize('theia/ai-registry/plugin/tarballRefused',
                'The plugin archive of "{0}" could not be extracted safely: one of its entries tried to write outside the plugin directory.',
                request.sourceUrl));
        }
        if (state.tooLarge) {
            return new Error(this.tooLarge(request.sourceUrl));
        }
        return error instanceof Error ? error : new Error(message);
    }

    /**
     * An entry whose own path escapes the root is unsafe and fails the extraction. A link whose
     * *target* merely points out of the plugin is dropped instead: it would have been written inside
     * the root, so refusing to create it loses that one link and nothing else.
     */
    protected mapEntry(header: TarEntryHeader, prefix: string, destination: string, state: TarExtractionState): TarEntryHeader {
        const original = this.toPosix(header.name);
        if (!this.isSafeArchivePath(original)) {
            state.unsafe.push(header.name);
            header.name = DROPPED_ENTRY;
            return header;
        }
        const relative = this.stripTopLevel(original);
        const withinSubtree = this.relativeToSubtree(relative, prefix);
        if (withinSubtree === undefined || withinSubtree === '') {
            // Outside the requested subtree, or the subtree/archive root directory itself.
            header.name = DROPPED_ENTRY;
            return header;
        }
        header.name = withinSubtree;
        state.subtreeEntryCount++;
        if (header.type === 'symlink' || header.type === 'link') {
            if (!this.isSafeLink(header, withinSubtree, prefix, destination, state)) {
                state.droppedLinks.push(withinSubtree);
                header.name = DROPPED_ENTRY;
                return header;
            }
            if (header.type === 'symlink') {
                state.keptSymlinks.add(withinSubtree);
            }
        }
        if (header.type === 'file') {
            state.byteCount += header.size ?? 0;
            if (state.byteCount > this.maxExtractedBytes()) {
                // Dropped rather than thrown: `map` runs synchronously from a `tar-stream` event
                // handler, so a throw escapes the pipeline's promise as an uncaught exception.
                state.byteCount -= header.size ?? 0;
                header.name = DROPPED_ENTRY;
                state.tooLarge = true;
                return header;
            }
            state.fileCount++;
        }
        return header;
    }

    /**
     * A symlink target is relative to the link's own directory; a hard-link target is an archive path,
     * so it gets the same strip and subtree mapping as the entry itself and is rewritten in place.
     */
    protected isSafeLink(header: TarEntryHeader, mappedName: string, prefix: string, destination: string, state: TarExtractionState): boolean {
        const linkname = header.linkname ? this.toPosix(header.linkname) : undefined;
        if (!linkname || path.posix.isAbsolute(linkname) || path.win32.isAbsolute(linkname)) {
            return false;
        }
        if (header.type === 'symlink') {
            const target = path.resolve(path.dirname(path.resolve(destination, mappedName)), linkname);
            return this.isInside(target, destination) && !this.traversesKeptSymlink(mappedName, linkname, state);
        }
        const mappedLink = this.relativeToSubtree(this.stripTopLevel(linkname), prefix);
        if (!mappedLink) {
            return false;
        }
        header.linkname = mappedLink;
        return this.isInside(path.resolve(destination, mappedLink), destination);
    }

    /**
     * The shape a lexical check cannot see: `sub/up -> ..` then `s -> sub/up/..` are both lexically
     * contained, while the second really resolves to the parent of the extraction root.
     */
    protected traversesKeptSymlink(mappedName: string, linkname: string, state: TarExtractionState): boolean {
        if (state.keptSymlinks.size === 0) {
            return false;
        }
        const base = path.posix.dirname(mappedName);
        const segments = linkname.split('/').filter(segment => segment && segment !== '.');
        let walked = base === '.' ? '' : base;
        for (const segment of segments) {
            walked = segment === '..'
                ? path.posix.dirname(walked || '.').replace(/^\.$/, '')
                : (walked ? `${walked}/${segment}` : segment);
            if (walked && state.keptSymlinks.has(walked)) {
                return true;
            }
        }
        return false;
    }

    protected isSafeArchivePath(posixPath: string): boolean {
        if (posixPath.startsWith('/') || path.win32.isAbsolute(posixPath)) {
            return false;
        }
        return !posixPath.split('/').includes('..');
    }

    protected isInside(target: string, root: string): boolean {
        const relative = path.relative(root, target);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }

    /** Drops GitHub's `<owner>-<repo>-<sha>/` wrapper. */
    protected stripTopLevel(posixPath: string): string {
        return posixPath.split('/').filter(Boolean).slice(1).join('/');
    }

    /** `''` for the subtree root itself, `undefined` when outside the subtree. */
    protected relativeToSubtree(relative: string, prefix: string): string | undefined {
        if (!prefix) {
            return relative;
        }
        if (relative === prefix) {
            return '';
        }
        return relative.startsWith(`${prefix}/`) ? relative.slice(prefix.length + 1) : undefined;
    }

    protected normalizeSubPath(sourcePath: string | undefined): string {
        return this.toPosix(sourcePath ?? '').split('/').filter(segment => segment && segment !== '.').join('/');
    }

    protected toPosix(value: string): string {
        return value.replace(/\\/g, '/');
    }

    /** Only GitHub sources are supported, matching what the skill installer accepts. */
    protected parseGitHub(sourceUrl: string): { owner: string; repo: string } {
        let url: URL;
        try {
            url = new URL(sourceUrl);
        } catch {
            throw new Error(nls.localize('theia/ai-registry/plugin/invalidSourceUrl', 'Invalid plugin source URL: {0}', sourceUrl));
        }
        if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
            throw new Error(nls.localize('theia/ai-registry/plugin/nonGitHubSource',
                'Only GitHub plugin sources are supported; "{0}" is not GitHub.', url.hostname));
        }
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 2) {
            throw new Error(nls.localize('theia/ai-registry/plugin/noOwnerRepo',
                'Cannot determine owner/repo from the plugin source URL: {0}', sourceUrl));
        }
        return { owner: segments[0], repo: segments[1].replace(/\.git$/, '') };
    }

    protected headers(token?: string): RequestHeaders {
        const headers: RequestHeaders = { 'User-Agent': USER_AGENT };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    protected toBytes(context: RequestContext): Uint8Array {
        // NodeRequestService returns raw bytes; the string branch is the base64 form used over RPC.
        const buffer = context.buffer;
        return typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : buffer;
    }

    /** Preference value (trimmed) when set, otherwise `GITHUB_TOKEN` from the environment. */
    protected resolveToken(): string | undefined {
        const fromPreference = this.preferenceService.get<string>(GITHUB_TOKEN_PREF, undefined)?.trim();
        const token = fromPreference || process.env.GITHUB_TOKEN?.trim();
        return token || undefined;
    }
}
