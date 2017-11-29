/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as paths from 'path';
import { GitLocator, GitLocateOptions } from './git-locator-protocol';

// tslint:disable:no-console

const ignore: () => IgnoreFilter = require('ignore');
const finder: (path: string) => FindIt = require('findit2');

export interface IgnoreFilter {
    add(patterns: string | IgnoreFilter): void
    ignores(pathname: string): boolean;
    depth: number;
}

export interface FindIt extends NodeJS.EventEmitter {
    stop(): void;
}

export class GitLocatorImpl implements GitLocator {

    protected disposed = false;

    dispose(): void {
        this.disposed = true;
    }

    locate(path: string, options: GitLocateOptions): Promise<string[]> {
        if (this.disposed) {
            return Promise.resolve([]);
        }
        return new Promise(resolve => {
            const filters = new Map<string, IgnoreFilter>();
            const repositoryPaths = new Set();
            const emitter = finder(path);
            emitter.on('directory', (dir: string, stat: fs.Stats, stop: () => void) => {
                const base = paths.basename(dir);
                if (base === '.git') {
                    const dirName = paths.dirname(dir);
                    try {
                        const resolvedPath = fs.realpathSync(dirName);
                        repositoryPaths.add(resolvedPath);
                    } catch (e) {
                        console.error(e);
                    }
                    if (!!options.maxCount && repositoryPaths.size >= options.maxCount) {
                        emitter.stop();
                    }
                    stop();
                    return;
                }
                if (this.shouldStop(dir, filters, options)) {
                    stop();
                    return;
                }
                filters.set(dir, this.createFilter(dir, filters));
            });
            const complete = () => resolve([...repositoryPaths]);
            emitter.once('end', complete);
            emitter.once('stop', complete);
            emitter.on('error', error => console.error(error));
        });
    }

    protected createFilter(path: string, filters: Map<string, IgnoreFilter>): IgnoreFilter {
        const ig = ignore();
        const parent = filters.get(paths.dirname(path));
        ig.depth = parent ? parent.depth + 1 : 0;
        if (parent && !fs.existsSync(paths.join(path, '.git'))) {
            ig.add(parent);
        }
        if (fs.existsSync(paths.join(path, '.gitignore'))) {
            ig.add(fs.readFileSync(paths.join(path, '.gitignore')).toString());
        }
        return ig;
    }

    protected shouldStop(pathname: string, filters: Map<string, IgnoreFilter>, options: GitLocateOptions): boolean {
        if (this.disposed) {
            return true;
        }
        const parent = paths.dirname(pathname);
        const ig = filters.get(parent);
        if (!ig) {
            return false;
        }
        return ig.depth >= options.maxDepth || ig.ignores(pathname);
    }

}
