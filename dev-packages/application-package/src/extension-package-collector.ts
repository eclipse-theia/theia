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
        protected readonly resolveModule: (modulePath: string) => string
    ) { }

    protected root: NodePackage;
    collect(pck: NodePackage): ReadonlyArray<ExtensionPackage> {
        this.root = pck;
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

    protected parent: ExtensionPackage | undefined;
    protected collectPackagesWithParent(pck: NodePackage, parent: ExtensionPackage): void {
        const current = this.parent;
        this.parent = parent;
        this.collectPackages(pck);
        this.parent = current;
    }

    protected collectPackage(name: string, versionRange: string): void {
        if (this.visited.has(name)) {
            return;
        }
        this.visited.set(name, true);

        const packagePath = this.resolveModule(name + '/package.json');
        const pck: NodePackage = readJsonFile(packagePath);
        if (RawExtensionPackage.is(pck)) {
            const parent = this.parent;
            const version = pck.version;
            const transitive = !(name in this.root.dependencies!);
            pck.installed = { packagePath, version, parent, transitive };
            pck.version = versionRange;
            const extensionPackage = this.extensionPackageFactory(pck);
            this.collectPackagesWithParent(pck, extensionPackage);
            this.sorted.push(extensionPackage);
        }
    }

}
