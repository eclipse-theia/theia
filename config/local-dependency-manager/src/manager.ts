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

export class LocalDependencyManager {

    verbose: boolean = true;

    readonly pck = new Package(process.cwd());

    list(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            console.log(dependency, this.pck.getLocalPath(dependency));
        }
    }

    clean(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            const nodeModulePath = this.pck.getNodeModulePath(dependency);
            try {
                fs.removeSync(nodeModulePath);
                console.log('Removed', nodeModulePath);
            } catch (err) {
                console.error(err.message);
            }
        }
    }

    update(pattern?: string): void {
        this.clean(pattern);
        for (const dependency of this.getLocalDependencies(pattern)) {
            try {
                cp.execSync(`npm install ${dependency}`, { stdio: [0, 1, 2] });
            } catch (err) {
                // no-op
            }
        }
    }

    watch(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            const dependencyPackage = new Package(this.pck.getLocalPath(dependency)!);
            for (const file of dependencyPackage.files) {
                const source = path.join(dependencyPackage.resolvePath(file), '**', '*');
                const dest = path.join(this.pck.getNodeModulePath(dependency), file);
                const watcher = new cpx.Cpx(source, dest);
                watcher.on("watch-ready", e => console.log('Watch directory:', watcher.base));
                watcher.on("copy", e => this.logInfo('Copied:', e.srcPath, '-->', e.dstPath));
                watcher.on("remove", e => this.logInfo('Removed:', e.path));
                watcher.on("watch-error", err => console.error(err.message));

                console.log('Sync:', watcher.src2dst(watcher.source))
                try {
                    watcher.cleanSync();
                } catch (err) {
                    console.error('Failed to sync:', err.message);
                }

                watcher.watch();
            }
        }
    }

    getLocalDependencies(pattern?: string): string[] {
        const test = this.test(pattern);
        return this.pck.localDependencies.filter(test);
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
