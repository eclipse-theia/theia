/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as gulp from 'gulp';
import * as File from 'vinyl';
import * as vinylPaths from 'vinyl-paths';
import * as through from 'through2';
import * as chokidar from 'chokidar';
import * as newer from 'gulp-newer';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as cp from 'child_process';
import * as stream from 'stream';

export const NPM_COMMAND = require('check-if-windows') ? 'npm.cmd' : 'npm';

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
        readonly includeDev: boolean,
        readonly verbose: boolean
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
        return localPath ? new Package(localPath, this.includeDev, this.verbose) : undefined;
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

    getNodeModulePath(dependency: Package): string {
        return this.resolvePath(path.join('node_modules', dependency.name));
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
                    this.execSync(NPM_COMMAND, 'install', archivePath);
                } finally {
                    fs.removeSync(archivePath);
                }
            }
        }
    }

    uninstallDependency(dependency: Package): void {
        this.execSync(NPM_COMMAND, 'uninstall', dependency.name);
    }

    cleanDependency(dependency: Package): void {
        if (this.isDependencyInstalled(dependency)) {
            const path = this.getNodeModulePath(dependency);
            fs.removeSync(path);
            console.log('Cleaned: ' + path);
        }
    }

    updateDependency(dependency: Package): void {
        this.cleanDependency(dependency);
        this.installDependency(dependency);
    }

    packDependency(dependency: Package): string | undefined {
        const archiveName = dependency.archiveName;
        if (archiveName) {
            this.execSync(NPM_COMMAND, 'pack', dependency.packagePath);
            return this.resolvePath(archiveName);
        }
        console.error(`${this.name} cannot be packed, since the version is not declared`);
        return undefined;
    }

    run(script: string): void {
        this.exec(NPM_COMMAND, 'run', script);
    }

    runSync(script: string): void {
        this.execSync(NPM_COMMAND, 'run', script);
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
            console.error(`An error occurred while executing the command: ${command} with the following arguments: ${args}`, err);
        }
    }

    get sources(): string[] {
        return this.files.map(file =>
            path.join(this.resolvePath(file), '**', '*')
        );
    }

    syncDependency(dependency: Package): void {
        this.copyUptodate(dependency);
        this.removeOutdated(dependency);
    }

    protected removeOutdated(dependency: Package): void {
        const dest = this.getNodeModulePath(dependency);
        const base = dependency.packagePath;

        const vp = vinylPaths();
        gulp.src(path.join(dest, '**', '*'))
            .pipe(this.outdated(base))
            .pipe(vp)
            .pipe(gulp.dest(dest))
            .on('end', () => {
                for (const path of vp.paths) {
                    if (fs.existsSync(path)) {
                        this.logInfo('Removed:', path)
                        fs.removeSync(path);
                    }
                }
            })
    }

    protected copyUptodate(dependency: Package): void {
        const dest = this.getNodeModulePath(dependency);
        const base = dependency.packagePath;

        const vp = vinylPaths();
        gulp.src(dependency.sources, { base })
            .pipe(newer(dest))
            .pipe(vp)
            .pipe(gulp.dest(dest))
            .on('end', () => {
                for (const path of vp.paths) {
                    this.logInfo('Copied:', path)
                }
            });
    }

    watchDependency(dependency: Package, sync: boolean): void {
        const sources = dependency.sources;
        const watcher = (gulp as any).watch(dependency.sources, {
            ignoreInitial: !sync,
            events: ['add', 'change', 'unlink', 'addDir', 'unlinkDir', 'ready', 'error']
        }, done => {
            this.syncDependency(dependency);
            done();
        }) as chokidar.FSWatcher;

        let index = 0;
        watcher.on('ready', () => console.log('Watching for changes: ' + sources[index++]));
        watcher.on('error', error => console.error(`Watcher error: ${error}`));
    }

    protected outdated(base: string): stream.Transform {
        return through.obj((file: File, encoding, done) => {
            const relativePath = path.relative(file.base, file.path);
            const fullPath = path.resolve(base, relativePath);
            try {
                if (fs.existsSync(fullPath)) {
                    done();
                } else {
                    done(undefined, file);
                }
            } catch (err) {
                done(err);
            }
        });
    }

    protected logInfo(message: string, ...optionalParams: any[]) {
        if (this.verbose) {
            console.log(new Date().toLocaleString() + ': ' + message, ...optionalParams);
        }
    }

}