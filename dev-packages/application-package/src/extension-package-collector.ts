/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { readJsonFile } from './json-file';
import { NodePackage, PublishedNodePackage } from './npm-registry';
import { ExtensionPackage, RawExtensionPackage } from './extension-package';

export class ExtensionPackageCollector {

    protected readonly sorted: ExtensionPackage[] = [];
    protected readonly visited = new Map<string, boolean>();

    constructor(
        protected readonly extensionPackageFactory: (raw: PublishedNodePackage) => ExtensionPackage,
        protected readonly loadModule: (modulePath: string) => string
    ) { }

    collect(pck: NodePackage): ReadonlyArray<ExtensionPackage> {
        this.collectPackages(pck);
        return this.sorted;
    }

    protected collectPackages(pck: NodePackage): void {
        if (!pck.dependencies) {
            return;
        }
        // tslint:disable-next-line:forin
        for (const dependency in pck.dependencies) {
            const versionRange = pck.dependencies[dependency]!;
            this.collectPackage(dependency, versionRange);
        }
    }

    protected collectPackage(name: string, versionRange: string): void {
        if (this.visited.has(name)) {
            return;
        }
        this.visited.set(name, true);

        const packagePath = this.loadModule(name + '/package.json');
        const pck: NodePackage = readJsonFile(packagePath);
        if (RawExtensionPackage.is(pck)) {
            const version = pck.version;
            pck.installed = { packagePath, version };
            pck.version = versionRange;
            const extensionPackage = this.extensionPackageFactory(pck);
            this.collectPackages(pck);
            this.sorted.push(extensionPackage);
        }
    }

}
