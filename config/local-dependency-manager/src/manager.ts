/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cpx from "cpx";
import * as path from "path";
import * as fs from "fs-extra";
import * as cp from "child_process";
import { Package } from "./package";

export interface Watcher {
    watch(sync?: boolean): void;
    sync(): void;
}

export class LocalDependencyManager {

    verbose: boolean = true;

    readonly pck = new Package(process.cwd());

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
        return this.composeWatcher(watchers);
    }

    protected composeWatcher(watchers: Watcher[]): Watcher {
        return {
            sync: () => watchers.forEach(w => w.sync()),
            watch: (shouldSync: boolean) => watchers.forEach(w => w.watch(shouldSync))
        }
    }

    protected createFileWatchers(dependency: string): Watcher[] {
        const localPath = this.pck.getLocalPath(dependency);
        if (!localPath) {
            return [];
        }
        const dependencyPackage = new Package(localPath);
        return dependencyPackage.files.map(file => {
            const source = path.join(dependencyPackage.resolvePath(file), '**', '*');
            const dest = path.join(this.pck.getNodeModulePath(dependency), file);
            return this.createFileWatcher(source, dest);
        });
    }

    protected createFileWatcher(source: string, dest: string): Watcher {
        const watcher = new cpx.Cpx(source, dest);
        watcher.on("watch-ready", e => console.log('Watch directory:', watcher.base));
        watcher.on("copy", e => this.logInfo('Copied:', e.srcPath, '-->', e.dstPath));
        watcher.on("remove", e => this.logInfo('Removed:', e.path));
        watcher.on("watch-error", err => console.error(err.message));
        const sync = () => {
            console.log('Sync:', watcher.src2dst(watcher.source));
            try {
                watcher.cleanSync();
                watcher.copySync();
            } catch (err) {
                console.error('Failed to sync:', err.message);
            }
        }
        const watch = (shouldSync?: boolean) => {
            if (shouldSync) {
                sync();
            }
            watcher.watch();
        }
        return { sync, watch };
    }

    protected logInfo(message: string, ...optionalParams: any[]) {
        if (this.verbose) {
            console.log(new Date().toLocaleString() + ': ' + message, ...optionalParams);
        }
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
