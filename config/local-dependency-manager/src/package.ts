/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as gulp from 'gulp';
import * as File from 'vinyl';
import * as vinylPaths from 'vinyl-paths';
import * as sourcemaps from 'gulp-sourcemaps';
import * as through from 'through2';
import * as chokidar from 'chokidar';
import * as newer from 'gulp-newer';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as cp from 'child_process';
import * as stream from 'stream';

export const NPM = require('check-if-windows') ? 'npm.cmd' : 'npm';

export function trimExtname(p: string): string {
    return path.join(path.dirname(p), path.basename(p, path.extname(p)));
}
export function filterByExtname(extname: string): (p: string) => boolean {
    return p => path.extname(p) === extname;
}
export const sourcemapExtname = '.map';
export const filterSourcemaps = filterByExtname(sourcemapExtname);

export function negateGlog(glob: string): string {
    return '!' + glob;
}
export function includeDir(dir: string): string {
    return path.join(dir, '**', '*');
}
export function excludeDir(dir: string): string {
    return negateGlog(includeDir(dir));
}
export function nodeModules(base: string): string {
    return path.join(base, 'node_modules');
}
export function includeNodeModules(base: string): string {
    return includeDir(nodeModules(base));
}
export function excludeNodeModules(base: string): string {
    return excludeDir(nodeModules(base));
}

export function awaitDirPaths(dir: string, resolvePaths?: Promise<string[]>): Promise<string[]> {
    return resolvePaths || resolveDirPaths(dir);
}
export function resolveDirPaths(dir: string): Promise<string[]> {
    return new Promise(resolve => {
        const vp = vinylPaths();
        gulp.src(includeDir(dir))
            .pipe(vp)
            .pipe(gulp.dest(dir))
            .on('end', () =>
                resolve(vp.paths)
            );
    });
}

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

export interface PackageOptions {
    readonly includeDev: boolean;
    readonly verbose: boolean;
    readonly originalSources: boolean;
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
        readonly options: PackageOptions
    ) {
        this.raw = require(path.resolve(packagePath, 'package.json')) || {};
        this.rawLocalDependencies = !!this.raw.localDependencies ? this.raw.localDependencies : {};
        this.rawLocalDevDependencies = this.options.includeDev && !!this.raw.localDevDependencies ? this.raw.localDevDependencies : {};
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
        return localPath ? new Package(localPath, this.options) : undefined;
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
                    this.npmSync('install', archivePath);
                    this.installOriginalSources(dependency);
                } finally {
                    fs.removeSync(archivePath);
                }
            }
        }
    }

    uninstallDependency(dependency: Package): void {
        this.npmSync('uninstall', dependency.name);
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
            this.npmSync('pack', dependency.packagePath);
            return this.resolvePath(archiveName);
        }
        console.error(`${this.name} cannot be packed, since the version is not declared`);
        return undefined;
    }

    run(script: string): void {
        this.npm('run', script);
    }

    runSync(script: string): void {
        this.npmSync('run', script);
    }

    npm(...args: string[]): void {
        this.exec(NPM, ...args);
    }

    npmSync(...args: string[]): void {
        this.execSync(NPM, ...args);
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
            includeDir(this.resolvePath(file))
        );
    }

    syncDependency(dependency: Package): void {
        this.installOriginalSources(dependency,
            this.copyUptodate(dependency)
        );
        this.removeOutdated(dependency);
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

    protected removeOutdated(dependency: Package): void {
        const dest = this.getNodeModulePath(dependency);
        const base = dependency.packagePath;

        const vp = vinylPaths();
        gulp.src(includeDir(dest))
            .pipe(this.outdated(base))
            .pipe(vp)
            .pipe(gulp.dest(dest))
            .on('end', () => {
                const paths: string[] = [];
                for (const path of vp.paths) {
                    if (fs.existsSync(path)) {
                        this.logVerbose('Removed:', path)
                        fs.removeSync(path);
                        paths.push(path);
                    }
                }
                this.logTask(dependency, `removed ${paths.length} outdated files`);
            });
    }

    protected copyUptodate(dependency: Package): Promise<string[]> {
        return new Promise(resolve => {
            const dest = this.getNodeModulePath(dependency);
            const base = dependency.packagePath;
            const vp = vinylPaths();
            gulp.src(dependency.sources, { base })
                .pipe(newer(dest))
                .pipe(vp)
                .pipe(gulp.dest(dest))
                .on('end', () => {
                    const paths: string[] = [];
                    for (const sourcePath of vp.paths) {
                        const targetPath = path.join(dest, sourcePath.substr(base.length));
                        this.logVerbose('Copied:', sourcePath, '->', targetPath);
                        paths.push(targetPath);
                    }
                    this.logTask(dependency, `copied ${paths.length} changed files`);
                    resolve(paths);
                });
        });
    }

    protected installOriginalSources(dependency: Package, resolvePaths?: Promise<string[]>): void {
        if (!this.options.originalSources) {
            return;
        }
        const base = this.getNodeModulePath(dependency);
        awaitDirPaths(base, resolvePaths).then(paths => {
            const sourcemapPaths = paths.filter(filterSourcemaps).map(trimExtname);
            if (sourcemapPaths.length === 0) {
                return [];
            }
            sourcemapPaths.push(excludeNodeModules(base));
            return this.doInstallOriginalSources(dependency, base, sourcemapPaths);
        }).then(sourcemaps => this.logTask(dependency, `installed original sources in ${sourcemaps.length} sourcemaps`));
    }

    protected doInstallOriginalSources(dependency: Package, base: string, sourcemapPaths: string[]): Promise<string[]> {
        return new Promise<string[]>(resolve => {
            const vp = vinylPaths();
            gulp.src(sourcemapPaths, { base, allowEmpty: true })
                .pipe(sourcemaps.init({
                    loadMaps: true
                }))
                .pipe(sourcemaps.mapSources(sourcePath =>
                    this.getOriginalSourcePath(base, sourcePath, dependency)
                ))
                .pipe(sourcemaps.write('.', {
                    includeContent: false,
                    addComment: true
                }))
                .pipe(vp)
                .pipe(gulp.dest(base))
                .on('end', () => {
                    const rewrittenSourcemaps = vp.paths.filter(filterSourcemaps);
                    if (this.isVerbose) {
                        for (const path of rewrittenSourcemaps) {
                            this.logVerbose('Installed original sources:', path)
                        }
                    }
                    resolve(rewrittenSourcemaps);
                });
        });
    }

    protected getOriginalSourcePath(base: string, sourcePath: string, dependency: Package) {
        const absoluteSourcePath = path.dirname(path.join(base, sourcePath));
        const dependencySourcePath = path.relative(absoluteSourcePath, dependency.packagePath);
        return path.join(dependencySourcePath, sourcePath);
    }

    protected logTask(dependency: Package, message: string): void {
        console.log(`${dependency.name} -> ${this.name}: ${message}`);
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

    protected get isVerbose(): boolean {
        return this.options.verbose;
    }

    protected logVerbose(message: string, ...optionalParams: any[]) {
        if (this.isVerbose) {
            console.log(new Date().toLocaleString() + ': ' + message, ...optionalParams);
        }
    }

}