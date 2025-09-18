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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { FileSearchService, WHITESPACE_QUERY_SEPARATOR } from '../common/file-search-service';
import { FileService, type TextFileContent } from '@theia/filesystem/lib/browser/file-service';
import * as fuzzy from '@theia/core/shared/fuzzy';
import { CancellationTokenSource, CancellationToken, ILogger, URI } from '@theia/core';
import ignore, { type Ignore } from 'ignore';
import { matchesPattern, IGNORE_FILES, processGitignoreContent, cleanAbsRelPath } from '@theia/core/lib/browser-only/file-search';

@injectable()
export class FileSearchServiceImpl implements FileSearchService {
    @inject(ILogger) 
    @named('file-search')
    protected logger: ILogger;

    @inject(FileService)
    protected readonly fs: FileService;

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

        const patterns = searchPattern.toLowerCase().split(WHITESPACE_QUERY_SEPARATOR).map(pattern => pattern.trim()).filter(Boolean);

        await Promise.all(Object.keys(roots).map(async root => {
            try {
                const rootUri = new URI(root);
                const rootOptions = roots[root];

                await this.doFind(rootUri, rootOptions, (fileUri: string) => {

                    // Skip results that have already been matched.
                    if (exactMatches.has(fileUri) || fuzzyMatches.has(fileUri)) {
                        return;
                    }

                    // Determine if the candidate matches any of the patterns exactly or fuzzy
                    const candidatePattern = fileUri.toLowerCase();
                    const patternExists = patterns.every(pattern => candidatePattern.includes(pattern));

                    if (patternExists) {
                        exactMatches.add(fileUri);
                    } else if (!searchPattern || searchPattern === '*') {
                        exactMatches.add(fileUri);
                    } else {
                        const fuzzyPatternExists = patterns.every(pattern => fuzzy.test(pattern, candidatePattern));

                        if (opts.fuzzyMatch && fuzzyPatternExists) {
                            fuzzyMatches.add(fileUri);
                        }
                    }

                    // Preemptively terminate the search when the list of exact matches reaches the limit.
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

        // Return the list of results limited by the search limit.
        return [...exactMatches, ...fuzzyMatches].slice(0, opts.limit);
    }

    protected async doFind(
        rootUri: URI,
        options: FileSearchService.BaseOptions,
        accept: (fileUri: string) => void,
        token: CancellationToken
    ): Promise<void> {

        try {
            const ig = ignore();
            const queue: URI[] = [rootUri];
            let queueIndex = 0;

            while (queueIndex < queue.length) {
                if (token.isCancellationRequested) {return; }

                const currentUri = queue[queueIndex++];

                try {
                    // Check exclude patterns
                    if (this.shouldExcludePath(currentUri, options.excludePatterns)) {
                        continue;
                    }

                    const stat = await this.fs.resolve(currentUri);

                    const relPath = cleanAbsRelPath(currentUri.path.toString());

                    // Check if path should be ignored by gitignore patterns
                    if (options.useGitIgnore && relPath && ig.ignores(relPath)) {
                        continue;
                    }

                    if (stat.isFile && this.shouldIncludePath(currentUri, options.includePatterns)) {
                        accept(currentUri.toString());
                    } else if (stat.isDirectory && Array.isArray(stat.children)) {
                        // Scan ignore files in this directory
                        if (options.useGitIgnore) {
                            await this.processIgnoreFiles(currentUri, ig);
                        }

                        // Add child directories and files to queue
                        for (const child of stat.children) {
                            queue.push(child.resource);
                        }
                    }
                } catch (e) {
                    this.logger.error(`Error reading directory: ${currentUri.toString()}`, e);
                }
            }
        } catch (e) {
            this.logger.error(`Error searching in: ${rootUri.toString()}`, e);
        }
    }

    private async processIgnoreFiles(dir: URI, ig: Ignore): Promise<void> {
        const ignoreFiles = await Promise.allSettled(
            IGNORE_FILES.map(file => this.fs.read(dir.resolve(file)))
        );

        const fromPath = dir.path.toString();

        const lines = ignoreFiles
            .filter(result => result.status === 'fulfilled')
            .flatMap((result: PromiseFulfilledResult<TextFileContent>) => processGitignoreContent(
                result.value.value,
                fromPath
            ));

        ig.add(lines);
    }

    private shouldExcludePath(uri: URI, excludePatterns: string[] | undefined): boolean {
        if (!excludePatterns?.length) {return false; }

        const path = uri.path.toString();
        return matchesPattern(path, excludePatterns, {
            dot: true,
            matchBase: true,
            nocase: true
        });
    }

    private shouldIncludePath(uri: URI, includePatterns: string[] | undefined): boolean {
        if (!includePatterns?.length) {return true; }

        const path = uri.path.toString();
        return matchesPattern(path, includePatterns, {
            dot: true,
            matchBase: true,
            nocase: true
        });
    }
}
