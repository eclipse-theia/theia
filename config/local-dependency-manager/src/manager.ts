/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from "path";
import * as fs from "fs-extra";
import * as cp from "child_process";
import { Package } from "./package";
import { FileWatcherProvider, Watcher } from "./watcher";

export class LocalDependencyManager {

    constructor(
        readonly pck: Package,
        readonly fileWatcherProvider: FileWatcherProvider
    ) { }

    list(pattern?: string): void {
        const dependencies = this.getLocalDependencies(pattern);
        if (dependencies.length !== 0) {
            for (const dependency of dependencies) {
                console.log(dependency, this.pck.getLocalPath(dependency));
            }
        } else {
            if (pattern) {
                console.log(`There are no local dependencies for the pattern: '${pattern}'`);
            } else {
                console.log('There are no local dependencies');
            }
        }
    }

    clean(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.cleanDependency(dependency);
        }
    }

    update(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.cleanDependency(dependency);
            this.installDependency(dependency);
        }
    }

    sync(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.syncDependency(dependency);
        }
    }

    watch(pattern?: string, sync?: boolean): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.watchDependency(dependency, sync);
        }
    }

    cleanDependency(dependency: string): void {
        const nodeModulePath = this.pck.getNodeModulePath(dependency);
        try {
            fs.removeSync(nodeModulePath);
            console.log('Removed', nodeModulePath);
        } catch (err) {
            console.error(err.message);
        }
    }

    installDependency(dependency: string): void {
        try {
            cp.execSync(`npm install ${dependency}`, { stdio: [0, 1, 2] });
        } catch (err) {
            // no-op
        }
    }

    watchDependency(dependency: string, sync?: boolean): void {
        this.createDependencyWatcher(dependency).watch(sync);
    }

    syncDependency(dependency: string): void {
        this.createDependencyWatcher(dependency).sync();
    }

    getLocalDependencies(pattern?: string): string[] {
        const test = this.test(pattern);
        return this.pck.localDependencies.filter(test);
    }

    createDependencyWatcher(dependency: string): Watcher {
        const watchers = this.createFileWatchers(dependency);
        return Watcher.compose(watchers);
    }

    protected createFileWatchers(dependency: string): Watcher[] {
        const localPath = this.pck.getLocalPath(dependency);
        if (!localPath) {
            return [];
        }
        const dependencyPackage = new Package(localPath);
        return dependencyPackage.files.map(file =>
            this.createFileWatcher(dependency, dependencyPackage, file)
        );
    }

    protected createFileWatcher(dependency: string, dependencyPackage: Package, file: string) {
        const source = path.join(dependencyPackage.resolvePath(file), '**', '*');
        const dest = path.join(this.pck.getNodeModulePath(dependency), file);
        return this.fileWatcherProvider.get(source, dest);
    }

    protected test(pattern?: string): (dependency: string) => boolean {
        const regExp = pattern ? new RegExp(pattern) : undefined;
        return (dependency: string) => {
            if (regExp) {
                return regExp.test(dependency);
            }
            return true;
        }
    }

}
