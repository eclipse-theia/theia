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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { FileSearchService, WHITESPACE_QUERY_SEPARATOR } from '../common/file-search-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import * as fuzzy from '@theia/core/shared/fuzzy';
import { CancellationTokenSource, CancellationToken, ILogger, URI } from '@theia/core';
import { matchesPattern, createIgnoreMatcher, getIgnorePatterns } from '@theia/filesystem/lib/browser-only/file-search';

@injectable()
export class FileSearchServiceImpl implements FileSearchService {
    @inject(ILogger)
    @named('file-search')
    protected logger: ILogger;

    @inject(FileService)
    protected readonly fs: FileService;

    /**
     * Searches for files matching the given pattern.
     * @param searchPattern - The pattern to search for
     * @param options - Search options including root URIs and filters
     * @param clientToken - Optional cancellation token
     * @returns Promise resolving to array of matching file URIs
     */
    async find(searchPattern: string, options: FileSearchService.Options, clientToken?: CancellationToken): Promise<string[]> {
        const cancellationSource = new CancellationTokenSource();

        if (clientToken) {
            clientToken.onCancellationRequested(() => cancellationSource.cancel());
        }

        const token = cancellationSource.token;
        const opts = {
            fuzzyMatch: true,
            limit: Number.MAX_SAFE_INTEGER,
            useGitIgnore: true,
            ...options
        };

        // Merge root-specific options with global options
        const roots: FileSearchService.RootOptions = options.rootOptions || {};
        if (options.rootUris) {
            for (const rootUri of options.rootUris) {
                if (!roots[rootUri]) {
                    roots[rootUri] = {};
                }
            }
        }
        // eslint-disable-next-line guard-for-in
        for (const rootUri in roots) {
            const rootOptions = roots[rootUri];
            if (opts.includePatterns) {
                const includePatterns = rootOptions.includePatterns || [];
                rootOptions.includePatterns = [...includePatterns, ...opts.includePatterns];
            }
            if (opts.excludePatterns) {
                const excludePatterns = rootOptions.excludePatterns || [];
                rootOptions.excludePatterns = [...excludePatterns, ...opts.excludePatterns];
            }
            if (rootOptions.useGitIgnore === undefined) {
                rootOptions.useGitIgnore = opts.useGitIgnore;
            }
        }

        const exactMatches = new Set<string>();
        const fuzzyMatches = new Set<string>();

        // Split search pattern into individual terms for matching
        const patterns = searchPattern.toLowerCase().split(WHITESPACE_QUERY_SEPARATOR).map(pattern => pattern.trim()).filter(Boolean);

        await Promise.all(Object.keys(roots).map(async root => {
            try {
                const rootUri = new URI(root);
                const rootOptions = roots[root];

                await this.doFind(rootUri, rootOptions, (fileUri: string) => {

                    // Skip already matched files
                    if (exactMatches.has(fileUri) || fuzzyMatches.has(fileUri)) {
                        return;
                    }

                    // Check for exact pattern matches
                    const candidatePattern = fileUri.toLowerCase();
                    const patternExists = patterns.every(pattern => candidatePattern.includes(pattern));

                    if (patternExists) {
                        exactMatches.add(fileUri);
                    } else if (!searchPattern || searchPattern === '*') {
                        exactMatches.add(fileUri);
                    } else {
                        // Check for fuzzy matches if enabled
                        const fuzzyPatternExists = patterns.every(pattern => fuzzy.test(pattern, candidatePattern));

                        if (opts.fuzzyMatch && fuzzyPatternExists) {
                            fuzzyMatches.add(fileUri);
                        }
                    }

                    // Cancel search if limit reached
                    if ((exactMatches.size + fuzzyMatches.size) >= opts.limit) {
                        cancellationSource.cancel();
                    }
                }, token);
            } catch (e) {
                this.logger.error('Failed to search:', root, e);
            }
        }));

        if (clientToken?.isCancellationRequested) {
            return [];
        }

        // Return results up to the specified limit
        return [...exactMatches, ...fuzzyMatches].slice(0, opts.limit);
    }

    /**
     * Performs the actual file search within a root directory.
     * @param rootUri - The root URI to search in
     * @param options - Search options for this root
     * @param accept - Callback function for each matching file
     * @param token - Cancellation token
     */
    protected async doFind(
        rootUri: URI,
        options: FileSearchService.BaseOptions,
        accept: (fileUri: string) => void,
        token: CancellationToken
    ): Promise<void> {
        const matcher = createIgnoreMatcher();
        const queue: URI[] = [rootUri];
        let queueIndex = 0;

        while (queueIndex < queue.length) {
            if (token.isCancellationRequested) {
                return;
            }

            const currentUri = queue[queueIndex++];

            try {
                // Skip excluded paths
                if (this.shouldExcludePath(currentUri, options.excludePatterns)) {
                    continue;
                }

                const stat = await this.fs.resolve(currentUri);
                const relPath = currentUri.path.toString().replace(/^\/|^\.\//, '');

                // Skip paths ignored by gitignore patterns
                if (options.useGitIgnore && relPath && matcher.ignores(relPath)) {
                    continue;
                }

                // Accept file if it matches include patterns
                if (stat.isFile && this.shouldIncludePath(currentUri, options.includePatterns)) {
                    accept(currentUri.toString());
                } else if (stat.isDirectory && Array.isArray(stat.children)) {
                    // Process ignore files in directory
                    if (options.useGitIgnore) {
                        const patterns = await getIgnorePatterns(
                            currentUri,
                            uri => this.fs.read(uri).then(content => content.value)
                        );

                        matcher.add(patterns);
                    }

                    // Add children to search queue
                    for (const child of stat.children) {
                        queue.push(child.resource);
                    }
                }
            } catch (e) {
                this.logger.error(`Error reading directory: ${currentUri.toString()}`, e);
            }
        }
    }

    /**
     * Checks if a path should be excluded based on exclude patterns.
     * @param uri - The URI to check
     * @param excludePatterns - Array of exclude patterns
     * @returns True if the path should be excluded
     */
    private shouldExcludePath(uri: URI, excludePatterns: string[] | undefined): boolean {
        if (!excludePatterns?.length) {
            return false;
        }

        const path = uri.path.toString();
        return matchesPattern(path, excludePatterns, {
            dot: true,
            matchBase: true,
            nocase: true
        });
    }

    /**
     * Checks if a path should be included based on include patterns.
     * @param uri - The URI to check
     * @param includePatterns - Array of include patterns
     * @returns True if the path should be included
     */
    private shouldIncludePath(uri: URI, includePatterns: string[] | undefined): boolean {
        if (!includePatterns?.length) {
            return true;
        }

        const path = uri.path.toString();
        return matchesPattern(path, includePatterns, {
            dot: true,
            matchBase: true,
            nocase: true
        });
    }
}
