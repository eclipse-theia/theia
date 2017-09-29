/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as paths from 'path';
import { NpmRegistry, NodePackage, PublishedNodePackage, sortByKey } from './npm-registry';
import { Extension, ExtensionPackage, RawExtensionPackage } from './extension-package';

import writeJsonFile = require('write-json-file');
function readJsonFile(path: string): any {
    return JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }));
}

export type ApplicationLog = (message?: any, ...optionalParams: any[]) => void;
export type ApplicationPackageTarget = 'browser' | 'electron';
export class ApplicationPackageOptions {
    readonly projectPath: string;
    readonly target: ApplicationPackageTarget;
    readonly registry?: NpmRegistry;
    readonly log?: ApplicationLog;
    readonly error?: ApplicationLog;
}
const defaultOptions: Partial<ApplicationPackageOptions> = {
    registry: new NpmRegistry(),
    log: console.log.bind(console),
    error: console.error.bind(console)
};
export class ApplicationPackage extends ApplicationPackageOptions {

    readonly registry: NpmRegistry;
    readonly log: ApplicationLog;
    readonly error: ApplicationLog;

    constructor(options: ApplicationPackageOptions) {
        super();
        Object.assign(this, defaultOptions, options);
    }

    protected _pck: NodePackage | undefined;
    get pck(): NodePackage {
        if (!this._pck) {
            this._pck = readJsonFile(this.packagePath);
        }
        return this._pck!;
    }

    protected _frontendModules: Map<string, string> | undefined;
    protected _frontendElectronModules: Map<string, string> | undefined;
    protected _backendModules: Map<string, string> | undefined;
    protected _backendElectronModules: Map<string, string> | undefined;
    protected _extensionPackages: Map<string, ExtensionPackage> | undefined;

    get extensionPackages(): ReadonlyArray<ExtensionPackage> {
        if (!this._extensionPackages) {
            this._extensionPackages = this.readExtensionPackages();
        }
        return Array.from(this._extensionPackages.values());
    }
    protected readExtensionPackages(): Map<string, ExtensionPackage> {
        const extensionPackages = new Map<string, ExtensionPackage>();
        if (!this.pck.dependencies) {
            return extensionPackages;
        }
        // tslint:disable-next-line:forin
        for (const dependency in this.pck.dependencies) {
            if (!extensionPackages.has(dependency)) {
                const packagePath = require.resolve(dependency + '/package.json');
                const dependencyPackage = readJsonFile(packagePath);
                if (RawExtensionPackage.is(dependencyPackage)) {
                    const version = dependencyPackage.version;
                    dependencyPackage.installed = { packagePath, version };
                    dependencyPackage.version = this.pck.dependencies[dependency]!;
                    const extensionPackage = this.newExtensionPackage(dependencyPackage);
                    extensionPackages.set(extensionPackage.name, extensionPackage);
                }
            }
        }
        return extensionPackages;
    }

    getExtensionPackage(extension: string): ExtensionPackage | undefined {
        return this.extensionPackages.find(pck => pck.name === extension);
    }

    async findExtensionPackage(extension: string): Promise<ExtensionPackage | undefined> {
        return this.getExtensionPackage(extension) || await this.resolveExtensionPackage(extension);
    }

    async resolveExtensionPackage(extension: string): Promise<ExtensionPackage | undefined> {
        const raw = await RawExtensionPackage.view(this.registry, extension);
        return raw ? this.newExtensionPackage(raw) : undefined;
    }

    newExtensionPackage(raw: PublishedNodePackage): ExtensionPackage {
        return new ExtensionPackage(raw, this.registry);
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

    get packagePath(): string {
        return this.path('package.json');
    }

    lib(...segments: string[]): string {
        return this.path('lib', ...segments);
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
        this.pck.dependencies = sortByKey(dependencies);
        return true;
    }

    save(): Promise<void> {
        return writeJsonFile(this.path('package.json'), this.pck, {
            detectIndent: true
        });
    }

}
