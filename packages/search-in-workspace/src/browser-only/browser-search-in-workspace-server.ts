// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin.
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
import { inject, injectable } from '@theia/core/shared/inversify';
import type {
    SearchInWorkspaceClient,
    SearchInWorkspaceOptions,
    SearchInWorkspaceResult,
    SearchInWorkspaceServer,
    SearchMatch
} from '../common/search-in-workspace-interface';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { URI } from '@theia/core';
import { FileService, TextFileOperationError, TextFileOperationResult, type TextFileContent } from '@theia/filesystem/lib/browser/file-service';
import { minimatch } from 'minimatch';
import ignore, { type Ignore } from 'ignore';

interface SearchController {
    regex: RegExp;
    searchPaths: URI[];
    options: SearchInWorkspaceOptions;
    isAborted: () => boolean;
    abort: () => void;
};

const DEFAULT_MINIMATCH_OPTS = {
    dot: true,
    matchBase: true,
    nocase: true
};

const IGNORE_FILES = [
    '.gitignore',
    '.ignore',
];

@injectable()
export class BrowserSearchInWorkspaceServer implements SearchInWorkspaceServer {
    @inject(FileService)
    protected readonly fs: FileService;

    private client: SearchInWorkspaceClient | undefined;
    private ongoingSearches: Map<number, SearchController> = new Map();
    private nextSearchId: number = 1;

    setClient(client: SearchInWorkspaceClient | undefined): void {
        this.client = client;
    }

    async search(what: string, rootUris: string[], opts: SearchInWorkspaceOptions = {}): Promise<number> {
        const searchId = this.nextSearchId++;
        const controller = new AbortController();

        const { regex, searchPaths, options } = await this.processSearchOptions(
            what,
            rootUris,
            opts,
        );

        this.ongoingSearches.set(searchId, {
            regex,
            searchPaths,
            options,
            isAborted: () => controller.signal.aborted,
            abort: () => controller.abort()
        });

        // Ignore promise in return because we need to return the searchId immediately.
        this.doSearch(searchId).catch((error: Error) => {
            const errorStr = `An error happened while searching (${error.message}).`;

            this.client?.onDone(searchId, errorStr);
        }).finally(() => {
            this.ongoingSearches.delete(searchId);
        });

        return searchId;
    }

    cancel(searchId: number): Promise<void> {
        const controller = this.ongoingSearches.get(searchId);

        if (controller) {
            this.ongoingSearches.delete(searchId);

            controller.abort();
            this.client?.onDone(searchId);
        }

        return Promise.resolve();
    }

    dispose(): void {
        this.ongoingSearches.forEach(controller => controller.abort());
        this.ongoingSearches.clear();
    }

    /**
     * Internal method to perform the search.
     * @param searchId - The ID of the search to perform.
     * @returns A promise that resolves when the search is complete.
     */
    private async doSearch(searchId: number): Promise<void> {
        const ctx = this.ongoingSearches.get(searchId);
        if (!ctx) {return; }

        const { regex, searchPaths, options, isAborted } = ctx;

        const maxFileSize = parseMaxFileSize(options.maxFileSize);
        const ig = ignore();

        let remaining = options.maxResults ?? Number.POSITIVE_INFINITY;

        for (const root of searchPaths) {
            if (isAborted()) {break; }

            const stack: URI[] = [root];

            while (stack.length && !isAborted() && remaining > 0) {
                let stat;
                const current = stack.pop()!;

                // Ignore .gitignore/.ignore files
                if (ig.ignores(cleanAbsRelPath(current.path.toString()))) {
                    continue;
                }

                // Ignore excluded paths
                if (this.shouldExcludePath(current, options.exclude || [])) {
                    continue;
                }

                try {
                    stat = await this.fs.resolve(current, { resolveMetadata: true });
                } catch {
                    continue;
                }

                // Skip if the file is not included in the include patterns
                if (stat.isFile && !this.shouldIncludePath(current, options.include)) {
                    continue;
                }

                // Skip if the file is too large
                if (stat.isFile && stat.size > maxFileSize) {continue; }

                // Process nested files
                if (stat.isDirectory) {
                    if (Array.isArray(stat.children)) {
                        for (const child of stat.children) {
                            stack.push(child.resource);
                        }
                    }

                    // Process ignore files if exists
                    if (!options.includeIgnored) {
                        await this.processIgnoreFiles(stat.resource, ig);
                    }

                    continue;
                }

                try {
                    const matches = await this.searchFileByLines(current, regex, isAborted, {
                        autoGuessEncoding: true,
                        acceptTextOnly: true
                    }, remaining);

                    if (matches.length > 0) {
                        const result: SearchInWorkspaceResult = {
                            root: root.path.toString(),
                            fileUri: current.path.toString(),
                            matches
                        };

                        this.client?.onResult(searchId, result);
                        remaining -= matches.length;
                        if (remaining <= 0) {break; }
                    }
                } catch (err) {
                    if (err instanceof TextFileOperationError && err.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
                        continue;
                    }

                    console.error(`Error reading file ${current.path.toString()}: ${err.message}`);
                    continue;
                }
            }

            if (remaining <= 0 || isAborted()) {break; }
        }

        this.client?.onDone(searchId);
    }

    private async searchFileByLines(
        uri: URI,
        re: RegExp,
        isAborted: () => boolean,
        opts: { autoGuessEncoding: boolean; acceptTextOnly: boolean },
        limit: number
    ): Promise<SearchMatch[]> {
        const { value: stream } = await this.fs.readStream(uri, opts);

        let leftover = '';
        let lineNo = 0;
        const matches: SearchMatch[] = [];

        await new Promise<void>((resolve, reject) => {
            stream.on('data', chunk => {
                if (isAborted()) {
                    stream.pause();
                    resolve();
                    return;
                }

                const data = leftover + chunk;
                const lines = data.split(/\r?\n/);
                leftover = lines.pop() ?? '';

                for (const line of lines) {
                    lineNo += 1; // 1-based

                    if (!line) {continue; }
                    if (re.global) {re.lastIndex = 0; }

                    let m: RegExpExecArray | null;

                    while ((m = re.exec(line))) {
                        matches.push({
                            line: lineNo,
                            character: m.index + 1, // 1-based
                            length: m[0].length,
                            lineText: line
                        });

                        if (matches.length >= limit) {
                            resolve();
                            return;
                        }
                    }
                }
            });

            stream.on('error', err => reject(err));

            stream.on('end', () => {
                if (leftover.length && matches.length < limit) {
                    lineNo += 1;
                    const line = leftover;

                    if (re.global) {re.lastIndex = 0; }

                    let m: RegExpExecArray | null;

                    while ((m = re.exec(line))) {
                        matches.push({
                            line: lineNo,
                            character: m.index + 1,
                            length: m[0].length,
                            lineText: line
                        });

                        if (matches.length >= limit) {break; }
                    }
                }

                resolve();
            });
        });

        return matches;
    }

    private async processIgnoreFiles(dir: URI, ig: Ignore): Promise<void> {
        const ignoreFiles = await Promise.allSettled(
            IGNORE_FILES.map(file => this.fs.read(dir.resolve(file)))
        );

        const lines = ignoreFiles
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => (result as PromiseFulfilledResult<TextFileContent>).value.value.split('\n'))
            .map(line => prefixGitignoreLine(dir.path.toString(), line))
            .filter((line): line is string => typeof line === 'string') as string[];

        ig.add(lines);
    }

    /**
     * Processes search options and returns clean paths and processed options.
     * This method consolidates the path processing logic and matchWholeWord handling for better readability.
     */
    private async processSearchOptions(_searchTerm: string, _searchPaths: string[], _options: SearchInWorkspaceOptions): Promise<{
        regex: RegExp,
        searchPaths: URI[],
        options: SearchInWorkspaceOptions,
    }> {
        const options = { ..._options };

        options.maxResults = typeof options.maxResults === 'number' && options.maxResults > 0 ? options.maxResults : Number.POSITIVE_INFINITY;
        options.include = (options.include ?? []).map(glob => normalizeGlob(glob));
        options.exclude = (options.exclude ?? []).map(glob => normalizeGlob(glob));

        // If there are absolute paths in `include` we will remove them and use
        // those as paths to search from
        const paths = await this.extractSearchPathsFromIncludes(
            _searchPaths.map(p => FileUri.fsPath(p)),
            options.include
        );

        // Final RegExp build with consideration of useRegExp/matchCase/matchWholeWord
        const regex = makeSearchRegex(_searchTerm, {
            useRegExp: !!options.useRegExp,
            matchCase: !!options.matchCase,
            matchWholeWord: !!options.matchWholeWord
        });

        return {
            regex,
            searchPaths: paths.map(p => URI.fromFilePath(p)),
            options
        };
    }

    protected shouldExcludePath(uri: URI, exclude: string[] | undefined): boolean {
        if (!exclude?.length) {return false; }

        const path = uri.path.toString();

        return exclude.some(glob => minimatch(path, glob, DEFAULT_MINIMATCH_OPTS));
    }

    private shouldIncludePath(uri: URI, include: string[] | undefined): boolean {
        if (!include?.length) {return true; }

        const path = uri.path.toString();

        return include.some(glob => minimatch(path, glob, DEFAULT_MINIMATCH_OPTS));
    }

    /**
     * The default search paths are set to be the root paths associated to a workspace
     * however the search scope can be further refined with the include paths available in the search options.
     * This method will replace the searching paths to the ones specified in the 'include' options but as long
     * as the 'include' paths can be successfully validated as existing.
     *
     * Therefore the returned array of paths can be either the workspace root paths or a set of validated paths
     * derived from the include options which can be used to perform the search.
     *
     * Any pattern that resulted in a valid search path will be removed from the 'include' list as it is
     * provided as an equivalent search path instead.
     */
    protected async extractSearchPathsFromIncludes(searchPaths: string[], include: string[]): Promise<string[]> {
        if (!include) {
            return searchPaths;
        }

        const resolvedPaths = new Set<string>();
        const searchPathsUris = searchPaths.map(p => new URI(p));

        for (const pattern of include) {
            const [base, _] = getGlobBase(pattern);
            const baseUri = new URI(base);

            for (const rootUri of searchPathsUris) {
                if (rootUri.isEqualOrParent(baseUri) && await this.fs.exists(baseUri)) {
                    resolvedPaths.add(baseUri.path.toString());
                }
            }
        }

        return resolvedPaths.size ? Array.from(resolvedPaths) : searchPaths;
    }
}

/**
 * Makes a search regex from a search term string and options.
 * @param term - The search term
 * @param opts - The search options
 * - useRegExp - Whether to use regular expressions (if true, the term is treated as a regular expression)
 * - matchCase - Whether to match case
 * - matchWholeWord - Whether to match whole word
 * @returns The search regex.
 */
function makeSearchRegex(
    term: string,
    opts: { useRegExp?: boolean; matchCase?: boolean; matchWholeWord?: boolean }
): RegExp {
    const useRegExp = !!opts.useRegExp;
    const matchCase = !!opts.matchCase;
    const matchWholeWord = !!opts.matchWholeWord;

    const flags = 'g' + (matchCase ? '' : 'i') + 'u';
    let source = useRegExp ? term : escapeForRegex(term);

    // Unicode word boundaries: letters/numbers/underscore
    if (matchWholeWord) {
        const wbL = '(?<![\\p{L}\\p{N}_])';
        const wbR = '(?![\\p{L}\\p{N}_])';
        source = `${wbL}${source}${wbR}`;
    }

    return new RegExp(source, flags);
}

function escapeForRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAbsolutePath(path: string): boolean {
    return path.startsWith('/');
}

function cleanAbsRelPath(path: string): string {
    if (path.startsWith('/')) {
        return path.slice(1);
    }

    if (path.startsWith('./')) {
        return path.slice(2);
    }

    return path;
}

/**
 * Ripgrep like glob normalization
 */
function normalizeGlob(glob: string): string {
    let neg = '';
    let root = false;

    if (glob.startsWith('!')) {
        neg = '!';
        glob = glob.slice(1);
    }

    // normalize slashes
    glob = glob.replace(/\\/g, '/');

    // trim redundant leading './' -> '/'
    if (glob.startsWith('./')) {
        glob = glob.slice(1);
    }

    // treat leading "/" as root-anchored
    if (glob.startsWith('/')) {
        root = true;
    }

    // directory pattern: "foo/" -> "foo/**"
    if (glob.endsWith('/') && !glob.endsWith('/**')) {
        glob = glob + '**';
    }

    // if not root-anchored and not already global (** at start), make it match 'anywhere'
    if (!root && !glob.startsWith('**')) {
        glob = '**/' + glob;
    }

    // collapse accidental repeats like "**/**/foo" -> "**/foo"
    glob = glob.replace(/(\*\*\/)+\*\*\//g, '**/');

    // return with negation restored
    return neg + glob;
}

/**
 * Get the base + rest of a glob pattern.
 *
 * @param pattern - The glob pattern to get the base of (like 'workspace2/foo/*.md')
 * @returns The base + rest of the glob pattern. (like ['workspace2/foo/', '*.md'])
 */
function getGlobBase(pattern: string): [string, string] {
    const isAbsolute = isAbsolutePath(pattern);
    const parts = pattern.replace(/^\//, '').split('/');
    const magic = /[*?[\]{}]/;

    const staticParts: string[] = [];

    for (const part of parts) {
        if (magic.test(part)) {break; }
        staticParts.push(part);
    }

    const base = (isAbsolute ? '/' : '') + staticParts.join('/');

    return [base, pattern.substring(base.length)];
}

// Convert patterns from dir base to root-relative git semantics.
function prefixGitignoreLine(baseRel: string, raw: string): string | undefined {
    let line = raw.replace(/\r?\n$/, '');
    if (!line || /^\s*#/.test(line)) {return undefined; }

    // handle escaped leading '!' and '#'
    const escapedBang = line.startsWith('\\!');
    const escapedHash = line.startsWith('\\#');
    if (escapedBang || escapedHash) {
        line = line.slice(1);
    }

    const neg = !escapedBang && line.startsWith('!');
    if (neg) {line = line.slice(1); }

    // normalize slashes in the pattern part
    line = line.replace(/\\/g, '/');

    // strip leading "./"
    if (line.startsWith('./')) {line = line.slice(2); }

    const anchored = line.startsWith('/');
    const hasSlash = line.includes('/');
    const prefix = baseRel ? baseRel.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '') : '';

    let pattern: string;

    if (anchored) {
        // "/foo" in base -> "base/foo"
        pattern = (prefix ? `${prefix}${line}` : line.slice(1)); // remove leading '/' if no base
    } else if (hasSlash) {
        // "bar/*.js" in base -> "base/bar/*.js"
        pattern = prefix ? `${prefix}/${line}` : line;
    } else {
        // "foo" in base -> "base/**/foo"
        pattern = prefix ? `${prefix}/**/${line}` : line;
    }

    // keep trailing slash semantics as-is (directory)
    return neg ? `!${pattern}` : pattern;
}

/**
 * Parses a maxFileSize string (e.g., "20M", "512K", "2G", or "12345") and returns the size in bytes.
 * Accepts suffixes of K, M, or G for kilobytes, megabytes, or gigabytes, respectively.
 * If no suffix is provided, the input is treated as bytes.
 *
 * @param maxFileSize The max file size string to parse.
 * @returns The size in bytes.
 */
function parseMaxFileSize(maxFileSize: string | undefined): number {
    const defaultSize = 20 * 1024 * 1024;

    if (!maxFileSize) {
        return defaultSize;
    }

    const trimmed = maxFileSize.trim().toUpperCase();
    const match = /^(\d+)([KMG])?$/.exec(trimmed);

    // If the format is invalid, fallback to default 20M
    if (!match) {
        return defaultSize;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'K':
            return value * 1024;
        case 'M':
            return value * 1024 * 1024;
        case 'G':
            return value * 1024 * 1024 * 1024;
        default:
            return value;
    }
}
