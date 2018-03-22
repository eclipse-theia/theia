/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as readline from 'readline';
import * as fuzzy from 'fuzzy';
import { injectable, inject } from 'inversify';
import { FileSearchService } from '../common/file-search-service';
import { RawProcessFactory } from "@theia/process/lib/node";
import { rgPath } from "vscode-ripgrep";
import { Deferred } from "@theia/core/lib/common/promise-util";
import { CancellationToken, ILogger } from '@theia/core';

@injectable()
export class FileSearchServiceImpl implements FileSearchService {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(RawProcessFactory) protected readonly rawProcessFactory: RawProcessFactory) { }

    async find(searchPattern: string, options: FileSearchService.Options, cancellationToken?: CancellationToken): Promise<string[]> {
        const opts = {
            fuzzyMatch: true,
            limit: Number.MAX_SAFE_INTEGER,
            useGitignore: true,
            defaultIgnorePatterns: [
                '^.git$'
            ],
            ...options
        };
        const args: string[] = [
            '--files',
            '--sort-files',
            '-u',
        ];
        const process = this.rawProcessFactory({
            command: rgPath,
            args,
            options: {
                cwd: opts.rootPath
            }
        });
        const result: string[] = [];
        const fuzzyMatches: string[] = [];
        const resultDeffered = new Deferred<string[]>();
        if (cancellationToken) {
            const cancel = () => {
                this.logger.debug('Search cancelled');
                process.kill();
                resultDeffered.resolve([]);
            };
            if (cancellationToken.isCancellationRequested) {
                cancel();
            } else {
                cancellationToken.onCancellationRequested(cancel);
            }
        }
        const lineReader = readline.createInterface({
            input: process.output,
            output: process.input
        });
        lineReader.on('line', line => {
            if (result.length >= opts.limit) {
                process.kill();
            } else {
                if (line.toLocaleLowerCase().indexOf(searchPattern.toLocaleLowerCase()) !== -1) {
                    result.push(line);
                } else if (opts.fuzzyMatch && fuzzy.test(searchPattern, line)) {
                    fuzzyMatches.push(line);
                }
            }
        });
        process.onError(e => {
            resultDeffered.reject(e);
        });
        process.onExit(e => {
            const left = opts.limit - result.length;
            result.push(...fuzzyMatches.slice(0, Math.min(left, fuzzyMatches.length)));
            resultDeffered.resolve(result);
        });
        return resultDeffered.promise;
    }

}
