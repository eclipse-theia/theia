/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable } from 'inversify';
import * as fs from 'fs';
import * as paths from 'path';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { Repository } from '../common/model';

const ignore: () => IgnoreFilter = require('ignore');
const abs: (path: string) => string = require('abs');
const finder = require('findit2');

export interface IgnoreFilter {
    add(patterns: string | IgnoreFilter): void
    ignores(pathname: string): boolean;
}

@injectable()
export class GitRepositoryLocator {

    /**
     * Resolves to an array of repositories, recursively discovered from the given root `path`.
     *
     * @param path the FS path of the root to start the discovery.
     */
    locate(path: string): Promise<Repository[]> {
        return new Promise<Repository[]>((resolve, reject) => {
            const filters = new Map<string, IgnoreFilter>();
            const repositoryPaths = new Set();
            const emitter = finder(abs(path));
            emitter.on('directory', (dir: string, stat: fs.Stats, stop: () => void) => {
                const base = paths.basename(dir);
                if (base === '.git') {
                    const dirName = paths.dirname(dir);
                    repositoryPaths.add(dirName);
                    stop();
                    return;
                }
                if (this.shouldStop(dir, filters)) {
                    stop();
                    return;
                }
                filters.set(dir, this.createFilter(dir, filters));
            });
            emitter.on('end', () => resolve([...repositoryPaths].map(p => <Repository>{ localUri: FileUri.create(p).toString() })));
            emitter.on('error', (error: Error) => reject(error));
        });
    }

    protected createFilter(path: string, filters: Map<string, IgnoreFilter>): IgnoreFilter {
        const ig = ignore();
        if (!fs.existsSync(paths.join(path, '.git'))) {
            const parent = filters.get(paths.dirname(path));
            if (parent) {
                ig.add(parent);
            }
        }
        if (fs.existsSync(paths.join(path, '.gitignore'))) {
            ig.add(fs.readFileSync(paths.join(path, '.gitignore')).toString());
        }
        return ig;
    }

    protected shouldStop(pathname: string, filters: Map<string, IgnoreFilter>): boolean {
        const parent = paths.dirname(pathname);
        const ig = filters.get(parent);
        return ig ? ig.ignores(pathname) : false;
    }

}
