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
import { CancellationTokenSource, CancellationToken, ILogger } from '@theia/core';
import { RawProcessFactory } from '@theia/process/lib/node';
import { FileSearchService } from '../common/file-search-service';

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

        if (options.defaultIgnorePatterns && options.defaultIgnorePatterns.length === 0) { // default excludes
            options.defaultIgnorePatterns.push('.git');
        }
        const opts = {
            fuzzyMatch: true,
            limit: Number.MAX_SAFE_INTEGER,
            useGitIgnore: true,
            ...options
        };
        const exactMatches = new Set<string>();
        const fuzzyMatches = new Set<string>();
        const stringPattern = searchPattern.toLocaleLowerCase();
        await Promise.all(options.rootUris.map(async root => {
            try {
                const rootUri = new URI(root);
                await this.doFind(rootUri, searchPattern, opts, candidate => {
                    const fileUri = rootUri.resolve(candidate).toString();
                    if (exactMatches.has(fileUri) || fuzzyMatches.has(fileUri)) {
                        return;
                    }
                    if (!searchPattern || searchPattern === '*' || candidate.toLocaleLowerCase().indexOf(stringPattern) !== -1) {
                        exactMatches.add(fileUri);
                    } else if (opts.fuzzyMatch && fuzzy.test(searchPattern, candidate)) {
                        fuzzyMatches.add(fileUri);
                    }
                    if (exactMatches.size + fuzzyMatches.size === opts.limit) {
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
        return [...exactMatches, ...fuzzyMatches];
    }

    private doFind(rootUri: URI, searchPattern: string, options: FileSearchService.Options,
        accept: (fileUri: string) => void, token: CancellationToken): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const cwd = FileUri.fsPath(rootUri);
                const args = this.getSearchArgs(options);
                // TODO: why not just child_process.spawn, theia process are supposed to be used for user processes like tasks and terminals, not internal
                const process = this.rawProcessFactory({ command: rgPath, args, options: { cwd } });
                process.onError(reject);
                process.output.on('close', resolve);
                token.onCancellationRequested(() => process.kill());

                const lineReader = readline.createInterface({
                    input: process.output,
                    output: process.input
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

    private getSearchArgs(options: FileSearchService.Options): string[] {
        const args = ['--files', '--case-sensitive'];
        if (options.includePatterns) {
            for (const includePattern of options.includePatterns) {
                let includeGlob = includePattern;
                if (!includeGlob.endsWith('*')) {
                    includeGlob = `${includeGlob}*`;
                }
                if (!includeGlob.startsWith('*')) {
                    includeGlob = `*${includeGlob}`;
                }
                args.push('--glob', includeGlob);
            }
        }
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
        return args;
    }

}
