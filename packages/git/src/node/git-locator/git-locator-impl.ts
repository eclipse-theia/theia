/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { GitLocator, GitLocateOptions } from './git-locator-protocol';

export type FindGitRepositories = (path: string, progressCb: (repos: string[]) => void) => Promise<string[]>;
const findGitRepositories: FindGitRepositories = require('find-git-repositories');

export interface GitLocateContext {
    maxCount: number
    readonly visited: Map<string, boolean>
}

export class GitLocatorImpl implements GitLocator {

    protected readonly options: {
        info: (message: string, ...args: any[]) => void
        error: (message: string, ...args: any[]) => void
    };

    constructor(options?: {
        info?: (message: string, ...args: any[]) => void
        error?: (message: string, ...args: any[]) => void
    }) {
        this.options = {
            info: (message, ...args) => console.info(message, ...args),
            error: (message, ...args) => console.error(message, ...args),
            ...options
        };
    }

    dispose(): void {
    }

    async locate(basePath: string, options: GitLocateOptions): Promise<string[]> {
        return await this.doLocate(basePath, {
            maxCount: typeof options.maxCount === 'number' ? options.maxCount : -1,
            visited: new Map<string, boolean>()
        });
    }

    protected doLocate(basePath: string, context: GitLocateContext): Promise<string[]> {
        const realBasePath = fs.realpathSync(basePath);
        if (context.visited.has(realBasePath)) {
            return Promise.resolve([]);
        }
        context.visited.set(realBasePath, true);
        return new Promise<string[]>(resolve => {
            fs.stat(realBasePath).then(async stat => {
                if (stat.isDirectory) {
                    const progress: string[] = [];
                    const paths = await findGitRepositories(realBasePath, repositories => {
                        progress.push(...repositories);
                        if (context.maxCount >= 0 && progress.length >= context.maxCount) {
                            resolve(progress.slice(0, context.maxCount).map(GitLocatorImpl.map));
                        }
                    });
                    if (context.maxCount >= 0 && paths.length >= context.maxCount) {
                        resolve(paths.slice(0, context.maxCount).map(GitLocatorImpl.map));
                        return;
                    }
                    const repositoryPaths = paths.map(GitLocatorImpl.map);
                    resolve(this.locateFrom(
                        newContext => this.generateNested(repositoryPaths, newContext),
                        context,
                        repositoryPaths
                    ));
                }
            }, () => []);
        });
    }

    protected * generateNested(repositoryPaths: string[], context: GitLocateContext) {
        for (const repository of repositoryPaths) {
            yield this.locateNested(repository, context);
        }
    }
    protected locateNested(repositoryPath: string, context: GitLocateContext): Promise<string[]> {
        return new Promise<string[]>(resolve => {
            fs.readdir(repositoryPath, async (err, files) => {
                if (err) {
                    this.options.error(err.message, err);
                    resolve([]);
                } else {
                    resolve(this.locateFrom(
                        newContext => this.generateRepositories(repositoryPath, files, newContext),
                        context
                    ));
                }
            });
        });
    }

    protected * generateRepositories(repositoryPath: string, files: string[], context: GitLocateContext) {
        for (const file of files) {
            if (file !== '.git') {
                yield this.doLocate(path.join(repositoryPath, file), {
                    ...context
                });
            }
        }
    }

    protected async locateFrom(
        generator: (context: GitLocateContext) => IterableIterator<Promise<string[]>>, parentContext: GitLocateContext, initial?: string[]
    ): Promise<string[]> {
        const result: string[] = [];
        if (initial) {
            result.push(...initial);
        }
        const context = {
            ...parentContext,
            maxCount: parentContext.maxCount - result.length
        };
        for (const locateRepositories of generator(context)) {
            const repositories = await locateRepositories;
            result.push(...repositories);
            if (context.maxCount >= 0) {
                if (result.length >= context.maxCount) {
                    return result.slice(0, context.maxCount);
                }
                context.maxCount -= repositories.length;
            }
        }
        return result;
    }

    static map(repository: string): string {
        return fs.realpathSync(path.dirname(repository));
    }

}
