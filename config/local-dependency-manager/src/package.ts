/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from "path";
import * as cp from "child_process";
import { FileWatcherProvider, Watcher } from "./watcher";

export interface RawPackage {
    name?: string;
    dependencies?: {
        [name: string]: string
    };
    devDependencies?: {
        [name: string]: string
    };
    files?: string[];
}

export class Package {

    static readonly LOCAL_PATH_PREFIX = 'file:';
    protected readonly raw: RawPackage;
    protected readonly rawDependencies: {
        [name: string]: string
    };
    protected readonly rawDevDependencies: {
        [name: string]: string
    };

    constructor(
        readonly packagePath: string,
        readonly fileWatcherProvider: FileWatcherProvider,
        readonly includeDev: boolean
    ) {
        this.raw = require(path.resolve(packagePath, 'package.json')) || {};
        this.rawDependencies = !!this.raw.dependencies ? this.raw.dependencies : {};
        this.rawDevDependencies = this.includeDev && !!this.raw.devDependencies ? this.raw.devDependencies : {};
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
        for (const dependency of this.localDevDependencies) {
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

    get localDevDependencies(): string[] {
        return this.devDependencies.filter(this.isLocalDependency.bind(this));
    }

    isLocalDependency(dependency: string | undefined): boolean {
        return this.getLocalPath(dependency) !== undefined;
    }

    getLocalPackage(dependency: string): Package | undefined {
        const localPath = this.getLocalPath(dependency);
        return localPath ? new Package(localPath, this.fileWatcherProvider, this.includeDev) : undefined;
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

    getVersion(dependency: string | undefined): string | undefined {
        if (!dependency) {
            return undefined;
        }
        if (this.rawDependencies[dependency]) {
            return this.rawDependencies[dependency];
        }
        return this.rawDevDependencies[dependency];
    }

    get dependencies(): string[] {
        return Object.keys(this.rawDependencies);
    }

    get devDependencies(): string[] {
        return Object.keys(this.rawDevDependencies);
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

    getNodeModulePath(dependency: undefined): undefined;
    getNodeModulePath(dependency: Package): string;
    getNodeModulePath(dependency: Package | undefined): string | undefined {
        if (dependency) {
            return this.resolvePath(path.join('node_modules', dependency.name));
        }
        return undefined;
    }

    updateDependency(dependency: Package): void {
        this.uninstallDependency(dependency);
        this.installDependency(dependency);
    }

    uninstallDependency(dependency: Package): void {
        this.execSync('npm', 'uninstall', dependency.name);
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
        const dest = path.join(this.getNodeModulePath(dependency), file);
        return this.fileWatcherProvider.get(source, dest);
    }

}