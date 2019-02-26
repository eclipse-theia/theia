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

import * as readline from 'readline';
import * as fuzzy from 'fuzzy';
import { injectable, inject } from 'inversify';
import { FileSearchService } from '../common/file-search-service';
import { RawProcessFactory } from '@theia/process/lib/node';
import { rgPath } from 'vscode-ripgrep';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { CancellationToken, ILogger } from '@theia/core';

@injectable()
export class FileSearchServiceImpl implements FileSearchService {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(RawProcessFactory) protected readonly rawProcessFactory: RawProcessFactory) { }

    async find(searchPattern: string, options: FileSearchService.Options, cancellationToken?: CancellationToken): Promise<string[]> {
        if (options.defaultIgnorePatterns && options.defaultIgnorePatterns.length === 0) { // default excludes
            options.defaultIgnorePatterns.push('.git');
        }
        const opts = {
            fuzzyMatch: true,
            limit: Number.MAX_SAFE_INTEGER,
            useGitIgnore: true,
            ...options
        };
        const args: string[] = this.getSearchArgs(opts);

        const resultDeferred = new Deferred<string[]>();
        try {
            const results = await Promise.all([
                this.doGlobSearch(searchPattern, args.slice(), opts.limit, cancellationToken),
                this.doStringSearch(searchPattern, args.slice(), opts.limit, opts.fuzzyMatch, cancellationToken)
            ]);
            const matches = Array.from(new Set([...results[0], ...results[1].exactMatches])).sort().slice(0, opts.limit);
            if (matches.length === opts.limit) {
                resultDeferred.resolve(matches);
            } else {
                resultDeferred.resolve([...matches, ...results[1].fuzzyMatches].slice(0, opts.limit));
            }
        } catch (e) {
            resultDeferred.reject(e);
        }
        return resultDeferred.promise;
    }

    private doGlobSearch(globPattern: string, searchArgs: string[], limit: number, cancellationToken?: CancellationToken): Promise<string[]> {
        const resultDeferred = new Deferred<string[]>();
        let glob = globPattern;
        if (!glob.endsWith('*')) {
            glob = `${glob}*`;
        }
        if (!glob.startsWith('*')) {
            glob = `*${glob}`;
        }
        searchArgs.unshift(glob);
        searchArgs.unshift('--glob');
        const process = this.rawProcessFactory({
            command: rgPath,
            args: searchArgs
        });
        this.setupCancellation(() => {
            this.logger.debug('Search cancelled');
            process.kill();
            resultDeferred.resolve([]);
        }, cancellationToken);
        const lineReader = readline.createInterface({
            input: process.output,
            output: process.input
        });
        const result: string[] = [];
        lineReader.on('line', line => {
            if (result.length >= limit) {
                process.kill();
            } else {
                const fileUriStr = FileUri.create(line).toString();
                result.push(fileUriStr);
            }
        });
        process.output.on('close', () => {
            resultDeferred.resolve(result);
        });
        process.onError(e => {
            resultDeferred.reject(e);
        });
        return resultDeferred.promise;
    }

    private doStringSearch(
        stringPattern: string, searchArgs: string[], limit: number, allowFuzzySearch: boolean, cancellationToken?: CancellationToken
    ): Promise<{ exactMatches: string[], fuzzyMatches: string[] }> {
        const resultDeferred = new Deferred<{ exactMatches: string[], fuzzyMatches: string[] }>();
        const process = this.rawProcessFactory({
            command: rgPath,
            args: searchArgs
        });
        this.setupCancellation(() => {
            this.logger.debug('Search cancelled');
            process.kill();
            resultDeferred.resolve({ exactMatches: [], fuzzyMatches: [] });
        }, cancellationToken);
        const lineReader = readline.createInterface({
            input: process.output,
            output: process.input
        });
        const exactMatches: string[] = [];
        const fuzzyMatches: string[] = [];
        lineReader.on('line', line => {
            if (exactMatches.length >= limit) {
                process.kill();
            } else {
                const fileUriStr = FileUri.create(line).toString();
                if (line.toLocaleLowerCase().indexOf(stringPattern.toLocaleLowerCase()) !== -1) {
                    exactMatches.push(fileUriStr);
                } else if (allowFuzzySearch && fuzzy.test(stringPattern, line)) {
                    fuzzyMatches.push(fileUriStr);
                }
            }
        });
        process.output.on('close', () => {
            const fuzzyResult = fuzzyMatches.slice(0, limit - exactMatches.length);
            resultDeferred.resolve({ exactMatches, fuzzyMatches: fuzzyResult });
        });
        process.onError(e => {
            resultDeferred.reject(e);
        });
        return resultDeferred.promise;
    }

    private getSearchArgs(options: FileSearchService.Options): string[] {
        const args: string[] = [
            '--files'
        ];
        if (!options.useGitIgnore) {
            args.push('-uu');
        }
        if (options && options.defaultIgnorePatterns) {
            options.defaultIgnorePatterns.filter(p => p !== '')
                .forEach(ignore => {
                    if (!ignore.endsWith('*')) {
                        ignore = `${ignore}*`;
                    }
                    if (!ignore.startsWith('*')) {
                        ignore = `!*${ignore}`;
                    } else {
                        ignore = `!${ignore}`;
                    }
                    args.push('--glob');
                    args.push(ignore);
                });
        }
        args.push(...options.rootUris.map(r => FileUri.fsPath(r)));
        return args;
    }

    private setupCancellation(onCancel: () => void, cancellationToken?: CancellationToken) {
        if (cancellationToken) {
            if (cancellationToken.isCancellationRequested) {
                onCancel();
            } else {
                cancellationToken.onCancellationRequested(onCancel);
            }
        }
    }

}
