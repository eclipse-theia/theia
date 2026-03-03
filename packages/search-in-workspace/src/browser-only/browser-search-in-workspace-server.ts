// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin and others.
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
import { inject, injectable, named } from '@theia/core/shared/inversify';
import type {
    SearchInWorkspaceClient,
    SearchInWorkspaceOptions,
    SearchInWorkspaceResult,
    SearchInWorkspaceServer,
    SearchMatch
} from '../common/search-in-workspace-interface';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { URI, ILogger } from '@theia/core';
import { FileService, TextFileOperationError, TextFileOperationResult } from '@theia/filesystem/lib/browser/file-service';
import { normalizeGlob, matchesPattern, createIgnoreMatcher, getIgnorePatterns } from '@theia/filesystem/lib/browser-only/file-search';
import { escapeRegExpCharacters } from '@theia/core/lib/common/strings';
import { BinarySize, type FileStatWithMetadata } from '@theia/filesystem/lib/common/files';

interface SearchController {
    regex: RegExp;
    searchPaths: URI[];
    options: SearchInWorkspaceOptions;
    isAborted: () => boolean;
    abort: () => void;
};

const minimatchOpts = {
    dot: true,
    matchBase: true,
    nocase: true
};

@injectable()
export class BrowserSearchInWorkspaceServer implements SearchInWorkspaceServer {
    @inject(ILogger) @named('search-in-workspace')
    protected readonly logger: ILogger;

    @inject(FileService)
    protected readonly fs: FileService;

    private client: SearchInWorkspaceClient | undefined;
    private ongoingSearches: Map<number, SearchController> = new Map();
    private nextSearchId: number = 1;

    /**
     * Sets the client for receiving search results
     */
    setClient(client: SearchInWorkspaceClient | undefined): void {
        this.client = client;
    }

    /**
     * Initiates a search operation and returns a search ID.
     * @param what - The search term or pattern
     * @param rootUris - Array of root URIs to search in
     * @param opts - Search options including filters and limits
     * @returns Promise resolving to the search ID
     */
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

        // Start search asynchronously and return searchId immediately
        this.doSearch(searchId).catch((error: Error) => {
            const errorStr = `An error happened while searching (${error.message}).`;

            this.client?.onDone(searchId, errorStr);
        }).finally(() => {
            this.ongoingSearches.delete(searchId);
        });

        return searchId;
    }

    /**
     * Cancels an ongoing search operation.
     * @param searchId - The ID of the search to cancel
     */
    cancel(searchId: number): Promise<void> {
        const controller = this.ongoingSearches.get(searchId);

        if (controller) {
            this.ongoingSearches.delete(searchId);

            controller.abort();
            this.client?.onDone(searchId);
        }

        return Promise.resolve();
    }

    /**
     * Disposes the service by aborting all ongoing searches.
     */
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

        if (!ctx) {
            return;
        }

        const { regex, searchPaths, options, isAborted } = ctx;

        const maxFileSize = options.maxFileSize ? BinarySize.parseSize(options.maxFileSize) : 20 * BinarySize.MB;
        const matcher = createIgnoreMatcher();

        let remaining = options.maxResults ?? Number.POSITIVE_INFINITY;

        for (const root of searchPaths) {
            if (isAborted()) {
                break;
            }

            const pathsStack: URI[] = [root];
            let index = 0;

            while (index < pathsStack.length && !isAborted() && remaining > 0) {
                const current = pathsStack[index++];
                const relPath = current.path.toString().replace(/^\/|^\.\//, '');

                // Skip excluded paths
                if (this.shouldExcludePath(current, options.exclude)) {
                    continue;
                }

                // Skip ignored files unless explicitly included
                if (!options.includeIgnored && relPath && matcher.ignores(relPath)) {
                    continue;
                }

                let stat: FileStatWithMetadata;

                try {
                    stat = await this.fs.resolve(current, { resolveMetadata: true });
                } catch {
                    continue;
                }

                // Skip files not matching include patterns
                if (stat.isFile && !this.shouldIncludePath(current, options.include)) {
                    continue;
                }

                // Skip files exceeding size limit
                if (stat.isFile && stat.size > maxFileSize) {
                    continue;
                }

                // Process directory contents
                if (stat.isDirectory) {
                    if (Array.isArray(stat.children)) {
                        // Load ignore patterns from files
                        if (!options.includeIgnored) {
                            const patterns = await getIgnorePatterns(
                                current,
                                uri => this.fs.read(uri).then(content => content.value)
                            );

                            matcher.add(patterns);
                        }

                        for (const child of stat.children) {
                            pathsStack.push(child.resource);
                        }
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
                        if (remaining <= 0) {
                            break;
                        }
                    }
                } catch (err) {
                    if (err instanceof TextFileOperationError && err.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
                        continue;
                    }

                    this.logger.error(`Error reading file ${current.path.toString()}: ${err.message}`);
                    continue;
                }
            }

            if (remaining <= 0 || isAborted()) {
                break;
            }
        }

        this.client?.onDone(searchId);
    }

    /**
     * Searches for matches within a file by processing it line by line.
     * @param uri - The file URI to search
     * @param re - The regex pattern to match
     * @param isAborted - Function to check if search was aborted
     * @param opts - File reading options
     * @param limit - Maximum number of matches to return
     * @returns Array of search matches found in the file
     */
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

                    if (!line) {
                        continue;
                    }

                    // Reset regex lastIndex for global patterns
                    if (re.global) {
                        re.lastIndex = 0;
                    }

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

                    // Reset regex lastIndex for global patterns
                    if (re.global) {
                        re.lastIndex = 0;
                    }

                    let m: RegExpExecArray | null;

                    while ((m = re.exec(line))) {
                        matches.push({
                            line: lineNo,
                            character: m.index + 1,
                            length: m[0].length,
                            lineText: line
                        });

                        if (matches.length >= limit) {
                            break;
                        }
                    }
                }

                resolve();
            });
        });

        return matches;
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

        // Build regex with consideration of useRegExp/matchCase/matchWholeWord
        const useRegExp = !!options.useRegExp;
        const matchCase = !!options.matchCase;
        const matchWholeWord = !!options.matchWholeWord;

        const flags = 'g' + (matchCase ? '' : 'i') + 'u';
        let source = useRegExp ? _searchTerm : escapeRegExpCharacters(_searchTerm);

        // Unicode word boundaries: letters/numbers/underscore
        if (matchWholeWord) {
            const wbL = '(?<![\\p{L}\\p{N}_])';
            const wbR = '(?![\\p{L}\\p{N}_])';
            source = `${wbL}${source}${wbR}`;
        }

        const regex = new RegExp(source, flags);

        const searchPaths = paths.map(p => URI.fromFilePath(p));

        return { regex, searchPaths, options };
    }

    /**
     * Checks if a path should be excluded based on exclude patterns.
     * @param uri - The URI to check
     * @param exclude - Array of exclude patterns
     * @returns True if the path should be excluded
     */
    protected shouldExcludePath(uri: URI, exclude: string[] | undefined): boolean {
        if (!exclude?.length) {
            return false;
        }

        return matchesPattern(uri.path.toString(), exclude, minimatchOpts);
    }

    /**
     * Checks if a path should be included based on include patterns.
     * @param uri - The URI to check
     * @param include - Array of include patterns
     * @returns True if the path should be included
     */
    private shouldIncludePath(uri: URI, include: string[] | undefined): boolean {
        if (!include?.length) {
            return true;
        }

        return matchesPattern(uri.path.toString(), include, minimatchOpts);
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
 * Get the base + rest of a glob pattern.
 *
 * @param pattern - The glob pattern to get the base of (like 'workspace2/foo/*.md')
 * @returns The base + rest of the glob pattern. (like ['workspace2/foo/', '*.md'])
 */
function getGlobBase(pattern: string): [string, string] {
    const isAbsolute = pattern.startsWith('/');
    const parts = pattern.replace(/^\//, '').split('/');
    const magic = /[*?[\]{}]/;

    const staticParts: string[] = [];

    for (const part of parts) {
        if (magic.test(part)) { break; }
        staticParts.push(part);
    }

    const base = (isAbsolute ? '/' : '') + staticParts.join('/');

    return [base, pattern.substring(base.length)];
}
