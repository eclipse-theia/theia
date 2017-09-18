/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as semver from 'semver';
import { NodePackage, Dependencies, view, ViewResult } from './npm';
export { NodePackage, Dependencies };

export class ExtensionPackage extends NodePackage {
    name: string;
    version: string;
    theiaExtensions?: Extension[];
    localPath?: string;
    installed: boolean = false;

    getReadme(): string {
        if (this.readme) {
            return this.readme;
        }
        if (this.localPath) {
            const readmePath = path.resolve(this.localPath, 'README.md');
            if (fs.existsSync(readmePath)) {
                return fs.readFileSync(readmePath, { encoding: 'utf8' });
            }
        }
        return '';
    }

    getAuthor(): string {
        if (this.publisher) {
            return this.publisher.username;
        }
        if (typeof this.author === 'string') {
            return this.author;
        }
        if (this.author && this.author.name) {
            return this.author.name;
        }
        if (!!this.maintainers && this.maintainers.length > 0) {
            return this.maintainers[0].username;
        }
        return '';
    }

    isOutdated(): boolean {
        if (!this.installed) {
            return false;
        }
        return !!this.latestVersion && semver.gt(this.latestVersion, this.version);
    }
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

export interface Extension {
    frontend?: string;
    frontendElectron?: string;
    backend?: string;
    backendElectron?: string;
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
    return Object.keys(object).sort().reduce((sorted, key) => {
        sorted[key] = object[key];
        return sorted;
    }, {});
}

export const defaultExtensionKeyword = "theia-extension";

export function npmView(name: string): Promise<ViewResult | undefined> {
    return view({ name, abbreviated: false }).catch(reason => {
        console.error(reason);
        return undefined;
    });
}

export class Model {
    target: 'web' | 'electron-renderer' | undefined;
    pck: NodePackage = {};
    readonly defaultConfig = <Config>{
        copyright: '',
        node_modulesPath: "./node_modules"
    };
    config: Config = {
        ...this.defaultConfig,
        extensionKeywords: [defaultExtensionKeyword],
        localDependencies: {}
    };

    protected _frontendModules: Map<string, string> | undefined;
    protected _frontendElectronModules: Map<string, string> | undefined;
    protected _backendModules: Map<string, string> | undefined;
    protected _backendElectronModules: Map<string, string> | undefined;
    protected readonly _extensionPackages = new Map<string, ExtensionPackage>();

    get extensionPackages(): ReadonlyArray<ExtensionPackage> {
        return Array.from(this._extensionPackages.values());
    }

    async readExtensionPackages(reader: (extension: string, path: string) => Promise<NodePackage | undefined>): Promise<void> {
        if (!this.pck.dependencies) {
            return;
        }
        const localDependencies = this.config.localDependencies;
        // tslint:disable-next-line:forin
        for (const extension in this.pck.dependencies) {
            const version = this.pck.dependencies[extension]!;
            const localPath = localDependencies ? localDependencies[extension] || version : version;
            await this.readExtensionPackage(extension, async () => {
                const raw = await reader(extension, localPath);
                if (ExtensionPackage.is(raw, this.config.extensionKeywords)) {
                    raw.localPath = localPath;
                    return new ExtensionPackage(raw);
                }
                const extensionPackage = this.findExtensionPackage(extension, version);
                if (!extensionPackage) {
                    console.error(`failed to find ${extension}@${version} on npm`);
                }
                return extensionPackage;
            }, localPath);
        }
    }

    protected async readExtensionPackage(extension: string, read: () => Promise<ExtensionPackage | undefined>, localPath?: string): Promise<void> {
        if (!this._extensionPackages.has(extension)) {
            const extensionPackage = await read();
            if (extensionPackage) {
                extensionPackage.installed = true;
                this._extensionPackages.set(extension, extensionPackage);
            }
        }
    }

    getExtensionPackage(extension: string): ExtensionPackage | undefined {
        return this.extensionPackages.find(pck => pck.name === extension);
    }

    async findExtensionPackage(extension: string, rawVersion?: string): Promise<ExtensionPackage | undefined> {
        const extensionPackage = this.getExtensionPackage(extension);
        if (extensionPackage) {
            return extensionPackage;
        }
        const result = await npmView(extension);
        if (!result) {
            return undefined;
        }
        const latestVersion = result['dist-tags']['latest'];
        const version = !rawVersion ? latestVersion : result['dist-tags'][rawVersion] || rawVersion;
        const raw = result.versions[version];
        if (!ExtensionPackage.is(raw, this.config.extensionKeywords)) {
            return undefined;
        }
        raw.readme = result.readme;
        raw.latestVersion = latestVersion;
        return new ExtensionPackage(raw);
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

}
