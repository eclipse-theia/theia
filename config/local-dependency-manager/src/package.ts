/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from "path";
import * as fs from "fs-extra";
import * as cp from "child_process";
import { FileWatcherProvider, Watcher } from "./watcher";

export interface RawPackage {
    name?: string;
    dependencies?: {
        [name: string]: string
    }
    files?: string[]
}

export class Package {

    static readonly LOCAL_PATH_PREFIX = 'file:';
    protected readonly raw: RawPackage;

    constructor(
        readonly packagePath: string,
        readonly fileWatcherProvider: FileWatcherProvider
    ) {
        this.raw = require(path.resolve(packagePath, 'package.json')) || {};
    }

    get name(): string {
        if (this.raw.name) {
            return this.raw.name;
        }
        return this.baseName;
    }

    get baseName(): string {
        return path.basename(this.packagePath);
    }

    get localPackages(): Package[] {
        const packages: Package[] = [];
        for (const dependency of this.localDependencies) {
            const pck = this.getLocalPackage(dependency);
            if (pck) {
                packages.push(pck);
            }
        }
        return packages;
    }

    get localDependencies(): string[] {
        return this.dependencies.filter(this.isLocalDependency.bind(this));
    }

    isLocalDependency(dependency: string | undefined): boolean {
        return this.getLocalPath(dependency) !== undefined;
    }

    getLocalPackage(dependency: string): Package | undefined {
        const localPath = this.getLocalPath(dependency);
        return localPath ? new Package(localPath, this.fileWatcherProvider) : undefined;
    }

    getLocalPath(dependency: string | undefined): string | undefined {
        const version = this.getVersion(dependency);
        return this.asLocalPath(version);
    }

    asLocalPath(version: string | undefined): string | undefined {
        if (version && version.startsWith(Package.LOCAL_PATH_PREFIX)) {
            const localPath = version.substr(Package.LOCAL_PATH_PREFIX.length);
            return this.resolvePath(localPath);
        }
        return undefined;
    }

    getNodeModulePath(dependency: undefined): undefined;
    getNodeModulePath(dependency: string): string;
    getNodeModulePath(dependency: string | undefined): string | undefined {
        if (dependency) {
            return this.resolvePath(path.join('node_modules', dependency));
        }
        return undefined;
    }

    getVersion(dependency: string | undefined): string | undefined {
        if (dependency && this.raw.dependencies) {
            return this.raw.dependencies[dependency];
        }
        return undefined;
    }

    get dependencies(): string[] {
        if (this.raw.dependencies) {
            return Object.keys(this.raw.dependencies);
        }
        return [];
    }

    get files(): string[] {
        if (this.raw.files) {
            return this.raw.files;
        }
        return ['lib', 'src'];
    }

    resolvePath(localPath: string): string {
        return path.normalize(path.resolve(this.packagePath, localPath));
    }

    updateDependency(dependency: Package): void {
        this.cleanDependency(dependency);
        this.installDependency(dependency);
    }

    cleanDependency(dependency: Package): void {
        const nodeModulePath = this.getNodeModulePath(dependency.baseName);
        try {
            fs.removeSync(nodeModulePath);
            console.log('Removed', nodeModulePath);
        } catch (err) {
            console.error(err.message);
        }
    }

    installDependency(dependency: Package): void {
        this.execSync('npm', 'install', dependency.name);
    }

    run(script: string): void {
        this.exec('npm', 'run', script);
    }

    runSync(script: string): void {
        this.execSync('npm', 'run', script);
    }

    exec(command: string, ...args: string[]): void {
        console.log(`${this.name}: ${command} ${args.join(' ')}`);
        const process = cp.spawn(command, args, {
            cwd: this.packagePath
        })
        process.on('error', err =>
            console.error(`${this.name}: ${err.message}`)
        );
        process.stdout.on('data', data =>
            console.log(`${this.name}: ${data}`)
        );
        process.stderr.on('data', data =>
            console.error(`${this.name}: ${data}`)
        );
    }

    execSync(command: string, ...args: string[]): void {
        console.log(`${this.name}: ${command} ${args.join(' ')}`);
        try {
            cp.spawnSync(command, args, {
                cwd: this.packagePath,
                stdio: [0, 1, 2]
            });
        } catch (err) {
            // no-op
        }
    }

    createWatcher(dependency: Package): Watcher {
        return Watcher.compose(
            dependency.files.map(file =>
                this.createFileWatcher(dependency, file)
            )
        );
    }

    protected createFileWatcher(dependency: Package, file: string): Watcher {
        const source = path.join(dependency.resolvePath(file), '**', '*');
        const dest = path.join(this.getNodeModulePath(dependency.baseName), file);
        return this.fileWatcherProvider.get(source, dest);
    }

}