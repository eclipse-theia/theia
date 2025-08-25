import { inject, injectable } from '@theia/core/shared/inversify';
import type { SearchInWorkspaceClient, SearchInWorkspaceOptions, SearchInWorkspaceResult, /* SearchInWorkspaceResult, */ SearchInWorkspaceServer, SearchMatch } from '../common/search-in-workspace-interface';
import { FileUri } from '@theia/core/lib/common/file-uri';
import * as path from 'path';
import { URI } from '@theia/core';
import { FileService, TextFileOperationError, TextFileOperationResult } from '@theia/filesystem/lib/browser/file-service';
import { minimatch } from 'minimatch';

type SearchController = {
    regex: RegExp;
    searchPaths: URI[];
    options: SearchInWorkspaceOptions;
    isAborted: () => boolean;
    abort: () => void;
}

@injectable()
export class BrowserSearchInWorkspaceServer implements SearchInWorkspaceServer {
    @inject(FileService)
    protected readonly fs: FileService;
    
    private client: SearchInWorkspaceClient | undefined;
    private ongoingSearches: Map<number, SearchController> = new Map();
    private nextSearchId: number = 1;
    private etags: Map<string, string> = new Map();
    
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
        const ctx = this.ongoingSearches.get(searchId)
        if (!ctx) return;

        const { regex, searchPaths, options, isAborted } = ctx;

        const maxFileSize = parseMaxFileSize(options.maxFileSize);
        
        let remaining = options.maxResults ?? Number.POSITIVE_INFINITY;
        
        for (const root of searchPaths) {
            if (isAborted()) break

            const stack: URI[] = [root];

            while (stack.length && !isAborted() && remaining > 0) {
                const current = stack.pop()!;

                if (this.shouldExcludePath(current, options.exclude || [])) continue;
                if (!this.shouldIncludePath(current, options.include || [])) continue;

                let stat;
                try {
                    stat = await this.fs.resolve(current, { resolveMetadata: true });
                } catch {
                    continue;
                }

                if (stat.isDirectory) {
                    if (Array.isArray(stat.children)) {
                        for (const child of stat.children) {
                            stack.push(child.resource);
                        }
                    }
                    continue;
                }

                if (!stat.isFile) continue;
                if (stat.size > maxFileSize) continue;

                // etag short-circuit
                // if (stat.etag && this.etags.get(current.toString()) === stat.etag) continue
                if (stat.etag) this.etags.set(current.toString(), stat.etag)

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
                        }

                        this.client?.onResult(searchId, result)
                        remaining -= matches.length;
                        if (remaining <= 0) break;
                    }
                } catch (err) {
                    // бинарные и нетекстовые файлы скипаем молча
                    if (err instanceof TextFileOperationError && err.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
                        continue
                    }
                    continue
                }
            }

            if (remaining <= 0 || isAborted()) break;
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
        const { value: stream } = await this.fs.readStream(uri, opts)

        let leftover = ''
        let lineNo = 0
        const matches: SearchMatch[] = []

        await new Promise<void>((resolve, reject) => {
            stream.on('data', chunk => {
                if (isAborted()) {
                    stream.pause()
                    resolve()
                    return
                }

                const data = leftover + chunk
                const lines = data.split(/\r?\n/)
                leftover = lines.pop() ?? ''

                for (const line of lines) {
                    lineNo += 1 // 1-based
                    if (!line) continue
                    if (re.global) re.lastIndex = 0
                    let m: RegExpExecArray | null
                    while ((m = re.exec(line)) !== null) {
                        matches.push({
                            line: lineNo,
                            character: m.index + 1, // 1-based
                            length: m[0].length,
                            lineText: line
                        })
                        if (matches.length >= limit) {
                            resolve()
                            return
                        }
                    }
                }
            })
            stream.on('error', err => reject(err))
            stream.on('end', () => {
                if (leftover.length && matches.length < limit) {
                    lineNo += 1
                    const line = leftover
                    if (re.global) re.lastIndex = 0
                    let m: RegExpExecArray | null
                    while ((m = re.exec(line)) !== null) {
                        matches.push({
                            line: lineNo,
                            character: m.index + 1,
                            length: m[0].length,
                            lineText: line
                        })
                        if (matches.length >= limit) break
                    }
                }
                resolve()
            })
        })

        return matches
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
        
        let include = this.replaceRelativeToAbsolute(_searchPaths, options.include);
        let exclude = this.replaceRelativeToAbsolute(_searchPaths, options.exclude);
        
        // If there are absolute paths in `include` we will remove them and use
        // those as paths to search from.
        const { paths, include: _include } = await this.extractSearchPathsFromIncludes(
            _searchPaths.map(root => FileUri.fsPath(root)), 
            include
        );
        
        options.include = _include;
        options.exclude = exclude;
        
        options.maxResults = typeof options.maxResults === 'number' && options.maxResults > 0 ? options.maxResults : Number.POSITIVE_INFINITY
        
        // финальная сборка RegExp с учётом useRegExp/matchCase/matchWholeWord
        const regex = makeSearchRegex(_searchTerm, {
            useRegExp: !!options.useRegExp,
            matchCase: !!options.matchCase,
            matchWholeWord: !!options.matchWholeWord
        });
        
        return {
            regex,
            searchPaths: paths.map(p => new URI(p)),
            options
        };
    }
    
    protected shouldExcludePath(dir: URI, exclude: string[]): boolean {
        const path = this.uriToMatchPath(dir);
        
        const minimatchOptions = {
            dot: true,
            matchBase: true,
            nocase: true
        };

        return exclude.some(glob => minimatch(path, normalizeGlob(glob), minimatchOptions));

        // TODO find relateive ignore files
        // if (ignore) {
        //     if (isIgnoredByPatterns(path, ignore.ignore, ignore.unignore)) {
        //         return false;
        //     }
        // }
    }    

    private shouldIncludePath(u: URI, include: string[]): boolean {
        if (!include?.length) return true;
        
        const path = this.uriToMatchPath(u);
        const minimatchOptions = { dot: true, matchBase: true, nocase: true };
        
        return include.some(glob => minimatch(path, normalizeGlob(glob), minimatchOptions))
    }

    private uriToMatchPath(u: URI): string {
        try {
            return FileUri.fsPath(u.toString())
        } catch {
            return u.path.toString()
        }
    }
    
    
    // TODO need to check any relative to searching file, not relative to search paths
    // protected async getIgnoredPaths(searchPaths: string[]): Promise<{ ignore: string[], unignore: string[] }> {
    //     const patterns: { ignore: string[]; unignore: string[] } = { ignore: [], unignore: [] };

    //     const files = [
    //         new URI(path.join(searchPaths[0], '.gitignore')),
    //         new URI(path.join(searchPaths[0], '.ignore')),
    //     ];
        
    //     try {
    //         for (const file of files) {
    //             if (await this.fileService.exists(file)) {
    //                 const {value} = await this.fileService.read(file);
    //                 const parsed = this.parseIgnoreFile(value);
                    
    //                 patterns.ignore.push(...parsed.ignore);
    //                 patterns.unignore.push(...parsed.unignore);
    //             }
    //         }
    //     }
    //     catch {}
        
    //     return patterns;
    // }
    
    /**
     * Parse .gitignore/.ignore content into ignore and unignore patterns
     */
    // private parseIgnoreFile(content: string): { ignore: string[]; unignore: string[] } {
    //     const ignore: string[] = [];
    //     const unignore: string[] = [];

    //     const lines = content.split(/\r?\n/);

    //     for (const rawLine of lines) {
    //         const line = rawLine.trim();

    //         if (!line || line.startsWith('#')) {
    //             continue;
    //         }

    //         if (line.startsWith('!')) {
    //             const pat = line.slice(1).trim();

    //             if (pat) {
    //                 unignore.push(pat);
    //             }

    //             continue;
    //         }

    //         ignore.push(line);
    //     }

    //     return { ignore, unignore };
    // }
    
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
    protected async extractSearchPathsFromIncludes(searchPaths: string[], _include: string[]): Promise<{ paths: string[], include: string[] }> {
        if (!_include) {
            return { paths: searchPaths, include: [] };
        }
        
        const resolvedPaths = new Set<string>();
        
        const include = [];
        
        for (const pattern of _include) {
            let keep = true;
            
            for (const root of searchPaths) {
                const absolutePath = await this.getAbsolutePathFromPattern(root, pattern);
                // undefined means the pattern cannot be converted into an absolute path
                if (absolutePath) {
                    resolvedPaths.add(absolutePath);
                    keep = false;
                }
            }
            
            if (keep) {
                include.push(pattern);
            }
        }
        
        return {
            paths: resolvedPaths.size > 0
                ? Array.from(resolvedPaths)
                : searchPaths,
            include
        };
    }

    /**
     * Transform include/exclude option patterns from relative patterns to absolute patterns.
     * E.g. './abc/foo.*' to '${root}/abc/foo.*', the transformation does not validate the
     * pattern against the file system as glob suffixes remain.
     *
     * @returns undefined if the pattern cannot be converted into an absolute path.
     */
    protected async getAbsolutePathFromPattern(root: string, pattern: string): Promise<string | undefined> {
        pattern = normalizeGlob(pattern);

        // The pattern is not referring to a single file or folder, i.e. not to be converted
        if (!path.isAbsolute(pattern) && !pattern.startsWith('./')) {
            return undefined;
        }
        
        // remove the `/**` suffix if present
        if (pattern.endsWith('/**')) {
            pattern = pattern.substring(0, pattern.length - 3);
        }
        
        // if `pattern` is absolute then `root` will be ignored by `path.resolve()`
        const targetPath = path.resolve(root, pattern);
        
        if (await this.fs.exists(new URI(targetPath))) {
            return targetPath;
        }
        
        return undefined;
    }
    
    /**
     * Transforms relative patterns to absolute paths, one for each given search path.
     * The resulting paths are not validated in the file system as the pattern keeps glob information.
     *
     * @returns The resulting list may be larger than the received patterns as a relative pattern may
     * resolve to multiple absolute patterns up to the number of search paths.
     */
    protected replaceRelativeToAbsolute(roots: string[], patterns: string[] = []): string[] {
        const expandedPatterns = new Set<string>();
        
        for (const pattern of patterns) {
            if (this.isPatternRelative(pattern)) {
                // create new patterns using the absolute form for each root
                for (const root of roots) {
                    expandedPatterns.add(path.resolve(root, pattern));
                }
            } else {
                expandedPatterns.add(pattern);
            }
        }
        
        return Array.from(expandedPatterns);
    }
    
    /**
     * Tests if the pattern is relative and should/can be made absolute.
     */
    protected isPatternRelative(pattern: string): boolean {
        return normalizeGlob(pattern).startsWith('./');
    }
}



function makeSearchRegex(
    term: string,
    opts: { useRegExp?: boolean; matchCase?: boolean; matchWholeWord?: boolean }
): RegExp {
    const useRegExp = !!opts.useRegExp
    const matchCase = !!opts.matchCase
    const matchWholeWord = !!opts.matchWholeWord

    const flags = 'g' + (matchCase ? '' : 'i') + 'u'
    let source = useRegExp ? term : escapeForRegex(term)

    // Unicode word boundaries: letters/numbers/underscore
    if (matchWholeWord) {
        const wbL = '(?<![\\p{L}\\p{N}_])'
        const wbR = '(?![\\p{L}\\p{N}_])'
        source = `${wbL}${source}${wbR}`
    }

    return new RegExp(source, flags)
}

function escapeForRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeGlob(glob: string): string {
    return glob.replace(/\\/g, '/')
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
