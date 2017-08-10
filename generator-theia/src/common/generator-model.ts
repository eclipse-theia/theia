/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import { NodePackage, Dependencies } from './npm';
export { NodePackage, Dependencies };

export interface ExtensionPackage extends NodePackage {
    name: string;
    version: string;
    theiaExtensions?: Extension[];
    localPath?: string;
}
export namespace ExtensionPackage {
    export function is(pck: NodePackage | undefined, extensionKeywords?: string[]): pck is ExtensionPackage {
        if (!pck || !pck.name) {
            return false;
        }
        const keywords = pck.keywords;
        if (!!keywords && !!extensionKeywords && extensionKeywords.length > 0) {
            return keywords.some(keyword =>
                extensionKeywords.indexOf(keyword) !== -1
            );
        }
        return !!pck.theiaExtensions;
    }
}

export class ExtensionPackageDiff {
    protected readonly _toAdd = new Map<string, string>();
    protected readonly _toRemove = new Set<string>();
    protected readonly _toLink = new Map<string, string>();
    protected readonly _toUnlink = new Set<string>();
    protected readonly all = [this._toAdd, this._toRemove, this._toLink, this._toUnlink];

    get empty(): boolean {
        for (const collection of this.all) {
            if (collection.size !== 0) {
                return false;
            }
        }
        return true;
    }
    get toAdd(): ReadonlyMap<string, string> {
        return this._toAdd;
    }
    get toRemove(): ReadonlySet<string> {
        return this._toRemove;
    }
    get toLink(): ReadonlyMap<string, string> {
        return this._toLink;
    }
    get toUnlink(): ReadonlySet<string> {
        return this._toUnlink;
    }

    add(name: string, version: string): void {
        this.delete(name);
        this._toAdd.set(name, version);
    }
    remove(name: string): void {
        this.delete(name);
        this._toRemove.add(name);
    }
    link(name: string, localPath: string): void {
        this.delete(name);
        this._toLink.set(name, localPath);
    }
    unlink(name: string): void {
        this.delete(name);
        this._toUnlink.add(name);
    }
    protected delete(name: string): void {
        for (const collection of this.all) {
            collection.delete(name);
        }
    }

}

export interface Extension {
    frontend?: string;
    frontendElectron?: string;
    backend?: string;
    backendElectron?: string;
}

export interface Config {
    copyright: string;
    node_modulesPath: string;
    extensionKeywords: string[];
    localDependencies: Dependencies;
}

export interface ExtensionConfig {
    testSupport: boolean;
    extensionKeyword: string;
}

export function sortByKey(object: { [key: string]: any }): { [key: string]: any } {
    return Object.keys(object).sort().reduce((sorted: { [key: string]: any }, key) => {
        sorted[key] = object[key];
        return sorted;
    }, {});
}

export const defaultExtensionKeyword = "theia-extension";

export class ProjectModel {
    target: 'web' | 'electron-renderer' | undefined;
    pck: NodePackage = {};
    pckPath: string;
    targetPck: NodePackage = {};
    readonly defaultConfig = <Config>{
        copyright: '',
        node_modulesPath: "node_modules"
    };
    config: Config = {
        ...this.defaultConfig,
        extensionKeywords: [defaultExtensionKeyword],
        localDependencies: {}
    };
    readonly defaultExtensionConfig = <ExtensionConfig>{
        testSupport: true
    };
    extensionConfig: ExtensionConfig = {
        ...this.defaultExtensionConfig,
        extensionKeyword: defaultExtensionKeyword
    };

    protected _frontendModules: Map<string, string> | undefined;
    protected _frontendElectronModules: Map<string, string> | undefined;
    protected _backendModules: Map<string, string> | undefined;
    protected _backendElectronModules: Map<string, string> | undefined;
    protected readonly _extensionPackages = new Map<string, ExtensionPackage>();

    get extensionPackages(): ReadonlyArray<ExtensionPackage> {
        return Array.from(this._extensionPackages.values());
    }

    async readExtensionPackages(reader: {
        read: (extension: string, version: string) => Promise<NodePackage | undefined>,
        readLocal: (extension: string, path: string) => Promise<NodePackage | undefined>
    }): Promise<void> {
        if (!this.pck.dependencies) {
            return;
        }
        const localDependencies = this.config.localDependencies;
        // tslint:disable-next-line:forin
        for (const extension in this.pck.dependencies) {
            if (extension in localDependencies) {
                const localPath = localDependencies[extension]!;
                await this.readExtensionPackage(extension, () => reader.readLocal(extension, localPath), localPath);
            }
            const version = this.pck.dependencies[extension]!;
            await this.readExtensionPackage(extension, () => reader.read(extension, version));
        }
    }

    protected async readExtensionPackage(extension: string, read: () => Promise<NodePackage | undefined>, localPath?: string): Promise<void> {
        if (!this._extensionPackages.has(extension)) {
            const pck = await read();
            if (ExtensionPackage.is(pck, this.config.extensionKeywords)) {
                pck.localPath = localPath;
                this._extensionPackages.set(extension, pck);
            }
        }
    }

    get frontendModules(): Map<string, string> {
        if (!this._frontendModules) {
            this._frontendModules = this.computeModules('frontend');
        }
        return this._frontendModules;
    }

    get frontendElectronModules(): Map<string, string> {
        if (!this._frontendElectronModules) {
            this._frontendElectronModules = this.computeModules('frontendElectron', 'frontend');
        }
        return this._frontendElectronModules;
    }

    get backendModules(): Map<string, string> {
        if (!this._backendModules) {
            this._backendModules = this.computeModules('backend');
        }
        return this._backendModules;
    }

    get backendElectronModules(): Map<string, string> {
        if (!this._backendElectronModules) {
            this._backendElectronModules = this.computeModules('backendElectron', 'backend');
        }
        return this._backendElectronModules;
    }

    protected computeModules<P extends keyof Extension, S extends keyof Extension = P>(primary: P, secondary?: S): Map<string, string> {
        const result = new Map<string, string>();
        let moduleIndex = 1;
        for (const extensionPackage of this.extensionPackages) {
            const extensions = extensionPackage.theiaExtensions;
            if (extensions) {
                for (const extension of extensions) {
                    const modulePath = extension[primary] || (secondary && extension[secondary]);
                    if (typeof modulePath === 'string') {
                        const extensionPath = path.join(extensionPackage.name, modulePath).split(path.sep).join('/');
                        result.set(`${primary}_${moduleIndex}`, extensionPath);
                        moduleIndex = moduleIndex + 1;
                    }
                }
            }
        }
        return result;
    }

    setDependency(name: string, version: string | undefined): boolean {
        const dependencies = this.pck.dependencies || {};
        const currentVersion = dependencies[name];
        if (currentVersion === version) {
            return false;
        }
        if (version) {
            dependencies[name] = version;
        } else {
            delete dependencies[name];
        }
        this.pck.dependencies = dependencies;
        return true;
    }

    protected _diff: ExtensionPackageDiff | undefined;
    get diff(): ExtensionPackageDiff {
        if (!this._diff) {
            this._diff = this.computDiff();
        }
        return this._diff;
    }
    protected computDiff(): ExtensionPackageDiff {
        const installedDependencies = (this.targetPck.dependencies || {});
        const extensionPackages = this.extensionPackages;
        const diff = new ExtensionPackageDiff();
        for (const extensionPackage of extensionPackages) {
            if (extensionPackage.name in installedDependencies) {
                continue;
            }
            if (extensionPackage.localPath) {
                diff.link(extensionPackage.name, extensionPackage.localPath);
            } else {
                diff.add(extensionPackage.name, extensionPackage.version!);
            }
        }

        for (const name in installedDependencies) {
            if (extensionPackages.some(p => p.name === name)) {
                continue;
            }
            if (name in this.config.localDependencies) {
                diff.unlink(name);
            } else {
                diff.remove(name);
            }
        }
        return diff;
    }

}
