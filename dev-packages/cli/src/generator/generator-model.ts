/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as paths from 'path';
import * as fs from 'fs-extra';
import * as semver from 'semver';
import { NodePackage, Dependencies, view, ViewResult } from './npm';
export { NodePackage, Dependencies };

export class ExtensionPackage extends NodePackage {
    name: string;
    version: string;
    theiaExtensions?: Extension[];
    installed: boolean = false;

    getReadme(): string {
        if (this.readme) {
            return this.readme;
        }
        const readmePath = require.resolve(name + '/README.md');
        if (fs.existsSync(readmePath)) {
            return fs.readFileSync(readmePath, { encoding: 'utf8' });
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
    export function is(pck: NodePackage | undefined): pck is ExtensionPackage {
        if (!pck || !pck.name) {
            return false;
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

export function sortByKey(object: { [key: string]: any }): { [key: string]: any } {
    return Object.keys(object).sort().reduce((sorted, key) => {
        sorted[key] = object[key];
        return sorted;
    }, {} as { [key: string]: any });
}

export const extensionKeyword = "theia-extension";

export function npmView(name: string): Promise<ViewResult | undefined> {
    return view({ name, abbreviated: false }).catch(reason => {
        console.error(reason);
        return undefined;
    });
}

export type ProjectTarget = 'browser' | 'electron';
export class ProjectOptions {
    readonly projectPath: string;
    readonly target: ProjectTarget;
}
export class Model extends ProjectOptions {
    readonly pck: NodePackage;
    readonly ready: Promise<void>;
    constructor(options: ProjectOptions) {
        super();
        Object.assign(this, options);
        this.pck = require(this.path('package.json')) || {};
        this.ready = this.readExtensionPackages();
    }

    protected _frontendModules: Map<string, string> | undefined;
    protected _frontendElectronModules: Map<string, string> | undefined;
    protected _backendModules: Map<string, string> | undefined;
    protected _backendElectronModules: Map<string, string> | undefined;
    protected readonly _extensionPackages = new Map<string, ExtensionPackage>();

    protected async readExtensionPackages(): Promise<void> {
        if (!this.pck.dependencies) {
            return;
        }
        // tslint:disable-next-line:forin
        for (const extension in this.pck.dependencies) {
            if (!this._extensionPackages.has(extension)) {
                const extensionPackage = require(extension + '/package.json');
                if (ExtensionPackage.is(extensionPackage)) {
                    extensionPackage.installed = true;
                    this._extensionPackages.set(extension, extensionPackage);
                } else {
                    console.error(`failed to find ${extension}`);
                }
            }
        }
    }

    get extensionPackages(): ReadonlyArray<ExtensionPackage> {
        return Array.from(this._extensionPackages.values());
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
        if (!ExtensionPackage.is(raw)) {
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
                        const extensionPath = paths.join(extensionPackage.name, modulePath).split(paths.sep).join('/');
                        result.set(`${primary}_${moduleIndex}`, extensionPath);
                        moduleIndex = moduleIndex + 1;
                    }
                }
            }
        }
        return result;
    }

    relative(path: string): string {
        return paths.relative(this.projectPath, path);
    }

    path(...segments: string[]): string {
        return paths.resolve(this.projectPath, ...segments);
    }

    srcGen(...segments: string[]): string {
        return this.path('src-gen', ...segments);
    }

    backend(...segments: string[]): string {
        return this.srcGen('backend', ...segments);
    }

    frontend(...segments: string[]): string {
        return this.srcGen('frontend', ...segments);
    }

    isBrowser(): boolean {
        return this.target === 'browser';
    }

    isElectron(): boolean {
        return this.target === 'electron';
    }

    ifBrowser<T>(value: T): T | undefined;
    ifBrowser<T>(value: T, defaultValue: T): T;
    ifBrowser<T>(value: T, defaultValue?: T): T | undefined {
        return this.isBrowser() ? value : defaultValue;
    }

    ifElectron<T>(value: T): T | undefined;
    ifElectron<T>(value: T, defaultValue: T): T;
    ifElectron<T>(value: T, defaultValue?: T): T | undefined {
        return this.isElectron() ? value : defaultValue;
    }

    get targetBackendModules(): Map<string, string> {
        return this.ifBrowser(this.backendModules, this.backendElectronModules);
    }

    get targetFrontendModules(): Map<string, string> {
        return this.ifBrowser(this.frontendModules, this.frontendElectronModules);
    }

}
