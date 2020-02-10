/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

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
        // eslint-disable-next-line guard-for-in
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

        let packagePath: string | undefined;
        try {
            packagePath = this.resolveModule(name + '/package.json');
        } catch (error) {
            console.warn(`Failed to resolve module: ${name}`);
        }
        if (!packagePath) {
            return;
        }
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
