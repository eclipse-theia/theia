/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cp from 'child_process';
import { injectable, inject } from 'inversify';
import { JSONExt, JSONObject } from '@phosphor/coreutils';
import { CommonAppGenerator, generatorTheiaPath, ProjectModel } from 'generator-theia';
import { TheiaBrowserGenerator } from 'generator-theia/generators/browser/browser-generator';
import { TheiaElectronGenerator } from 'generator-theia/generators/electron/electron-generator';
import { MaybePromise, Disposable, DisposableCollection, Event, Emitter, ILogger, cmd } from "@theia/core";
import { FileUri } from "@theia/core/lib/node";
import { FileSystem } from "@theia/filesystem/lib/common";
import { FileSystemWatcherServer, DidFilesChangedParams } from "@theia/filesystem/lib/common/filesystem-watcher-protocol";

@injectable()
export class AppProjectOptions {
    readonly path: string;
    readonly target: 'electron' | 'browser';
    readonly npmClient: 'npm' | 'yarn' | string;
    readonly autoInstall: boolean;
}

@injectable()
export class AppProject implements Disposable {

    protected readonly packageUri: Promise<string>;
    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnInstall = new DisposableCollection();
    protected readonly onChangePackageEmitter = new Emitter<void>();
    protected readonly onWillInstallEmitter = new Emitter<void>();
    protected readonly onDidInstallEmitter = new Emitter<boolean>();

    constructor(
        @inject(AppProjectOptions) protected readonly options: AppProjectOptions,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcherServer) protected readonly fileSystemWatcher: FileSystemWatcherServer,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.packageUri = this.load().then(model =>
            FileUri.create(model.pckPath).toString()
        );
        this.toDispose.push(this.toDisposeOnInstall);
        this.toDispose.push(this.fileSystemWatcher);
        this.fileSystemWatcher.setClient({
            onDidFilesChanged: changes => this.onDidFilesChanged(changes)
        });
        this.packageUri.then(async uri => {
            const watcher = await this.fileSystemWatcher.watchFileChanges(uri);
            this.toDispose.push(Disposable.create(() => this.fileSystemWatcher.unwatchFileChanges(watcher)));
        });
        this.toDispose.push(this.onWillInstallEmitter);
        this.toDispose.push(this.onDidInstallEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onDidChangePackage(): Event<void> {
        return this.onChangePackageEmitter.event;
    }
    protected fireDidChangePackage(): void {
        this.onChangePackageEmitter.fire(undefined);
    }
    protected isPackageChanged(param: DidFilesChangedParams): Promise<boolean> {
        return this.packageUri.then(uri =>
            param.changes.some(change => change.uri === uri)
        );
    }
    protected onDidFilesChanged(param: DidFilesChangedParams): void {
        this.isPackageChanged(param).then(changed => {
            if (changed) {
                this.fireDidChangePackage();
                this.autoInstall();
            }
        });
    }

    load(): Promise<ProjectModel> {
        return this.generator.then(generator => generator.model);
    }
    protected get generator(): Promise<CommonAppGenerator> {
        const generatorConstructor = this.options.target === 'browser' ? TheiaBrowserGenerator : TheiaElectronGenerator;
        const generator = new generatorConstructor([], {
            env: {
                cwd: this.options.path
            },
            resolved: generatorTheiaPath
        });
        generator.initializing();
        return generator.configuring().then(() => generator);
    }

    async save(model: MaybePromise<ProjectModel>): Promise<void> {
        const resolved = await model;
        const stat = await this.fileSystem.getFileStat(FileUri.create(resolved.pckPath).toString());
        await this.fileSystem.setContent(stat, JSON.stringify(resolved.pck, undefined, 2));
    }

    async update(run: (model: ProjectModel) => MaybePromise<boolean>): Promise<void> {
        const model = await this.load();
        if (await run(model)) {
            await this.save(model);
        }
    }

    get onWillInstall(): Event<void> {
        return this.onWillInstallEmitter.event;
    }
    protected fireWillInstall(): void {
        this.onWillInstallEmitter.fire(undefined);
    }

    get onDidInstall(): Event<boolean> {
        return this.onDidInstallEmitter.event;
    }
    protected fireDidInstall(failed: boolean): void {
        this.onDidInstallEmitter.fire(failed);
    }

    async autoInstall(): Promise<void> {
        if (this.options.autoInstall && await this.needInstall()) {
            await this.install();
        }
    }

    async needInstall(): Promise<boolean> {
        const model = await this.load();
        const source = (model.targetPck.dependencies || {}) as JSONObject;
        const target = (model.pck.dependencies || {}) as JSONObject;
        return JSONExt.deepEqual(source, target);
    }

    async install(): Promise<void> {
        this.toDisposeOnInstall.dispose();
        this.fireWillInstall();
        this.logger.info('Intalling the app...');
        try {
            this.logger.info('Generating the app', this.options.target, this.options.path);
            await this.generate();
            this.logger.info('The app generation is finished', this.options.target, this.options.path);

            this.logger.info('Building the app', this.options.npmClient, this.options.path);
            await this.build();
            this.logger.info('The app build is finished', this.options.npmClient, this.options.path);

            this.logger.info('The app installation is finished');
            this.fireDidInstall(false);
        } catch (err) {
            this.logger.info('The app installation is failed', err);
            this.fireDidInstall(true);
        }
    }

    async generate(): Promise<void> {
        const generator = await this.generator;
        generator.writing();
        return new Promise<void>((resolve, reject) =>
            generator.fs.commit([], err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        );
    }

    build(): Promise<void> {
        return new Promise((resolve, reject) => {
            const [command, args] = cmd(this.options.npmClient, 'build');
            const cwd = this.options.path;
            const buildProcess = cp.spawn(command, args, { cwd });
            const onStop = this.toDisposeOnInstall.push(Disposable.create(() =>
                buildProcess.kill('SIGKILL')
            ));
            buildProcess.on('close', code => {
                onStop.dispose();
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error('The app build is failed: ' + code));
                }
            });
            buildProcess.once('error', err => {
                onStop.dispose();
                reject(new Error('The app build is failed: ' + err));
            });
            buildProcess.stderr.on('data', data =>
                this.logger.debug(log =>
                    log('[stdout] the app build', data)
                )
            );
            buildProcess.stdout.on('data', data =>
                this.logger.debug(log =>
                    log('[stdout] the app build', data)
                )
            );
        });
    }

}
