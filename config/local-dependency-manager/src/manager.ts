/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Package } from './package';

export class LocalDependencyManager {

    constructor(
        readonly pck: Package
    ) { }

    list(pattern?: string): void {
        const dependencies = this.getLocalDependencies(pattern);
        if (dependencies.length !== 0) {
            for (const dependency of dependencies) {
                console.log(dependency.name, dependency.packagePath);
            }
        } else {
            if (pattern) {
                console.log(`There are no local dependencies for the pattern: '${pattern}'`);
            } else {
                console.log('There are no local dependencies');
            }
        }
    }

    install(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.pck.installDependency(dependency);
        }
        if (!pattern) {
            this.pck.npmSync('install');
        }
    }

    uninstall(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.pck.uninstallDependency(dependency);
        }
    }

    clean(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.pck.cleanDependency(dependency);
        }
    }

    update(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.pck.updateDependency(dependency);
        }
    }

    sync(pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            this.pck.syncDependency(dependency);
        }
    }

    watch(pattern?: string, sync?: boolean, script?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            if (script) {
                dependency.run(script);
            }
            this.pck.watchDependency(dependency, !!sync);
        }
    }

    run(script: string, pattern?: string): void {
        for (const dependency of this.getLocalDependencies(pattern)) {
            dependency.runSync(script);
        }
    }

    getLocalDependencies(pattern?: string): Package[] {
        // TODO topological sort
        const test = this.test(pattern);
        return this.pck.localPackages.filter(test);
    }

    protected test(pattern?: string): (dependency: Package) => boolean {
        const regExp = pattern ? new RegExp(pattern) : undefined;
        return (dependency: Package) => {
            if (!regExp) {
                return true;
            }
            return regExp.test(dependency.name);
        }
    }

}
