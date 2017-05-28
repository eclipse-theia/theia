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
    version?: string;
    localDependencies?: {
        [name: string]: string
    };
    localDevDependencies?: {
        [name: string]: string
    };
    files?: string[];
}

export class Package {

    protected readonly raw: RawPackage;
    protected readonly rawLocalDependencies: {
        [name: string]: string
    };
    protected readonly rawLocalDevDependencies: {
        [name: string]: string
    };

    constructor(
        readonly packagePath: string,
        readonly fileWatcherProvider: FileWatcherProvider,
        readonly includeDev: boolean
    ) {
        this.raw = require(path.resolve(packagePath, 'package.json')) || {};
        this.rawLocalDependencies = !!this.raw.localDependencies ? this.raw.localDependencies : {};
        this.rawLocalDevDependencies = this.includeDev && !!this.raw.localDevDependencies ? this.raw.localDevDependencies : {};
    }

    get name(): string {
        if (this.raw.name) {
            return this.raw.name;
        }
        return this.baseName;
    }

    get version(): string | undefined {
        return this.raw.version;
    }

    get baseName(): string {
        return path.basename(this.packagePath);
    }

    get archiveName(): string | undefined {
        if (!this.version) {
            return undefined;
        }
        return `${this.name}-${this.version}.tgz`;
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

    getLocalPackage(dependency: string): Package | undefined {
        const localPath = this.getLocalPath(dependency);
        return localPath ? new Package(localPath, this.fileWatcherProvider, this.includeDev) : undefined;
    }

    getLocalPath(dependency: string | undefined): string | undefined {
        if (!dependency) {
            return undefined;
        }
        if (this.rawLocalDependencies[dependency]) {
            return this.asLocalPath(this.rawLocalDependencies[dependency]);
        }
        return this.asLocalPath(this.rawLocalDevDependencies[dependency]);
    }

    protected asLocalPath(value: string | undefined): string | undefined {
        return !!value ? this.resolvePath(value) : undefined;
    }

    get localDependencies(): string[] {
        return Object.keys(this.rawLocalDependencies);
    }

    get localDevDependencies(): string[] {
        return Object.keys(this.rawLocalDevDependencies);
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

    isDependencyInstalled(dependency: Package): boolean {
        const path = this.getNodeModulePath(dependency);
        return fs.existsSync(path);
    }

    installDependency(dependency: Package): void {
        if (!this.isDependencyInstalled(dependency)) {
            const archivePath = this.packDependency(dependency);
            if (archivePath) {
                try {
                    this.execSync('npm', 'install', archivePath);
                } finally {
                    fs.removeSync(archivePath);
                }
            }
        }
    }

    uninstallDependency(dependency: Package): void {
        this.execSync('npm', 'uninstall', dependency.name);
    }

    cleanDependency(dependency: Package): void {
        fs.removeSync(this.getNodeModulePath(dependency));
    }

    updateDependency(dependency: Package): void {
        this.cleanDependency(dependency);
        this.installDependency(dependency);
    }

    packDependency(dependency: Package): string | undefined {
        const archiveName = dependency.archiveName;
        if (archiveName) {
            this.execSync('npm', 'pack', dependency.packagePath);
            return this.resolvePath(archiveName);
        }
        console.error(`${this.name} cannot be packed, since the version is not declared`);
        return undefined;
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
        const source = path.join(dependency.resolvePath(file), '**', '*.*');
        const dest = path.join(this.getNodeModulePath(dependency), file);
        return this.fileWatcherProvider.get(source, dest);
    }

}