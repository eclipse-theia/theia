/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as fuzzy from 'fuzzy';
import * as readline from 'readline';
import { rgPath } from 'vscode-ripgrep';
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { CancellationTokenSource, CancellationToken, ILogger, isWindows } from '@theia/core';
import { RawProcessFactory } from '@theia/process/lib/node';
import { FileSearchService } from '../common/file-search-service';
import * as path from 'path';

@injectable()
export class FileSearchServiceImpl implements FileSearchService {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(RawProcessFactory) protected readonly rawProcessFactory: RawProcessFactory) { }

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
        // tslint:disable-next-line:forin
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

        if (isWindows) {
            // Allow users on Windows to search for paths using either forwards or backwards slash
            searchPattern = searchPattern.replace(/\//g, '\\');
        }

        const stringPattern = searchPattern.toLocaleLowerCase();
        await Promise.all(Object.keys(roots).map(async root => {
            try {
                const rootUri = new URI(root);
                const rootPath = FileUri.fsPath(rootUri);
                const rootOptions = roots[root];
                await this.doFind(rootUri, rootOptions, candidate => {
                    // Convert OS-native candidate path to a file URI string
                    const fileUri = FileUri.create(path.resolve(rootPath, candidate)).toString();
                    // Skip results that have already been matched.
                    if (exactMatches.has(fileUri) || fuzzyMatches.has(fileUri)) {
                        return;
                    }
                    if (!searchPattern || searchPattern === '*' || candidate.toLocaleLowerCase().indexOf(stringPattern) !== -1) {
                        exactMatches.add(fileUri);
                    } else if (opts.fuzzyMatch && fuzzy.test(searchPattern, candidate)) {
                        fuzzyMatches.add(fileUri);
                    }
                    // Preemptively terminate the search when the list of exact matches reaches the limit.
                    if (exactMatches.size === opts.limit) {
                        cancellationSource.cancel();
                    }
                }, token);
            } catch (e) {
                console.error('Failed to search:', root, e);
            }
        }));
        if (clientToken && clientToken.isCancellationRequested) {
            return [];
        }
        // Return the list of results limited by the search limit.
        return [...exactMatches, ...fuzzyMatches].slice(0, opts.limit);
    }

    private doFind(rootUri: URI, options: FileSearchService.BaseOptions,
        accept: (fileUri: string) => void, token: CancellationToken): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const cwd = FileUri.fsPath(rootUri);
                const args = this.getSearchArgs(options);
                // TODO: why not just child_process.spawn, theia process are supposed to be used for user processes like tasks and terminals, not internal
                const process = this.rawProcessFactory({ command: rgPath, args, options: { cwd } });
                process.onError(reject);
                process.outputStream.on('close', resolve);
                token.onCancellationRequested(() => process.kill());

                const lineReader = readline.createInterface({
                    input: process.outputStream,
                    output: process.inputStream
                });
                lineReader.on('line', line => {
                    if (token.isCancellationRequested) {
                        process.kill();
                    } else {
                        accept(line);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    private getSearchArgs(options: FileSearchService.BaseOptions): string[] {
        const args = ['--files', '--case-sensitive'];
        if (options.includePatterns) {
            for (const includePattern of options.includePatterns) {
                if (includePattern) {
                    args.push('--glob', includePattern);
                }
            }
        }
        if (options.excludePatterns) {
            for (const excludePattern of options.excludePatterns) {
                if (excludePattern) {
                    args.push('--glob', `!${excludePattern}`);
                }
            }
        }
        if (!options.useGitIgnore) {
            args.push('-uu');
        }
        return args;
    }

}
