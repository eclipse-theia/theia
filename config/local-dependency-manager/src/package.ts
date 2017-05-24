/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';

export interface RawPackage {
    dependencies?: {
        [name: string]: string
    }
    files?: string[]
}

export class Package {

    static readonly LOCAL_PATH_PREFIX = 'file:';
    protected readonly raw: RawPackage;

    constructor(
        readonly packagePath: string
    ) {
        this.raw = require(path.resolve(packagePath, 'package.json')) || {};
    }

    get localDependencies(): string[] {
        return this.dependencies.filter(this.isLocalDependency.bind(this));
    }

    isLocalDependency(dependency: string | undefined): boolean {
        return this.getLocalPath(dependency) !== undefined;
    }

    getLocalPath(dependency: string | undefined): string | undefined {
        const version = this.getVersion(dependency);
        return this.asLocalPath(version);
    }

    asLocalPath(version: string | undefined): string | undefined {
        if (version && version.startsWith(Package.LOCAL_PATH_PREFIX)) {
            const localPath = version.substr(Package.LOCAL_PATH_PREFIX.length);
            return this.resolvePath(localPath);
        }
        return undefined;
    }

    getNodeModulePath(dependency: undefined): undefined;
    getNodeModulePath(dependency: string): string;
    getNodeModulePath(dependency: string | undefined): string | undefined {
        if (dependency) {
            return this.resolvePath(path.join('node_modules', dependency));
        }
        return undefined;
    }

    getVersion(dependency: string | undefined): string | undefined {
        if (dependency && this.raw.dependencies) {
            return this.raw.dependencies[dependency];
        }
        return undefined;
    }

    get dependencies(): string[] {
        if (this.raw.dependencies) {
            return Object.keys(this.raw.dependencies);
        }
        return [];
    }

    get files(): string[] {
        if (this.raw.files) {
            return this.raw.files;
        }
        return ['lib', 'src'];
    }

    resolvePath(localPath: string): string {
        return path.normalize(path.resolve(this.packagePath, localPath));
    }

}