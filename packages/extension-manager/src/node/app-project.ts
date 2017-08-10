/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import { injectable, inject } from 'inversify';
import { CommonAppGenerator, generatorTheiaPath, ProjectModel } from 'generator-theia';
import { TheiaBrowserGenerator } from 'generator-theia/generators/browser/browser-generator';
import { TheiaElectronGenerator } from 'generator-theia/generators/electron/electron-generator';
import {
    MaybePromise, Disposable, DisposableCollection, Event, Emitter, ILogger,
    CancellationTokenSource, CancellationToken, isCancelled
} from "@theia/core";
import { FileUri, ServerProcess } from "@theia/core/lib/node";

import { FileSystem } from "@theia/filesystem/lib/common";
import { FileSystemWatcherServer, DidFilesChangedParams } from "@theia/filesystem/lib/common/filesystem-watcher-protocol";
import { DidStopInstallationParam } from '../common/extension-protocol';
import { AppProjectInstallerFactory, AppProjectInstaller } from './app-project-installer';

@injectable()
export class AppProjectOptions {
    readonly path: string;
    readonly target: 'electron' | 'browser';
    readonly autoInstall: boolean;
}

export class InstallParams {
    readonly force: boolean;
}

@injectable()
export class AppProject implements Disposable {

    protected readonly packageUri: Promise<string>;
    protected readonly toDispose = new DisposableCollection();
    protected readonly onChangePackageEmitter = new Emitter<void>();
    protected readonly onWillInstallEmitter = new Emitter<void>();
    protected readonly onDidInstallEmitter = new Emitter<DidStopInstallationParam>();

    constructor(
        @inject(AppProjectOptions) readonly options: AppProjectOptions,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcherServer) protected readonly fileSystemWatcher: FileSystemWatcherServer,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(AppProjectInstallerFactory) protected readonly installerFactory: AppProjectInstallerFactory,
        @inject(ServerProcess) protected readonly serverProcess: ServerProcess
    ) {
        logger.debug('AppProjectOptions', options);
        this.packageUri = this.load().then(model =>
            FileUri.create(model.pckPath).toString()
        );
        this.toDispose.push(this.fileSystemWatcher);
        this.fileSystemWatcher.setClient({
            onDidFilesChanged: changes => this.onDidFilesChanged(changes)
        });
        this.packageUri.then(async uri => {
            const watcher = await this.fileSystemWatcher.watchFileChanges(uri, {
                ignoreInitial: false
            });
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
        generator.destinationRoot(this.options.path);
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

    get onDidInstall(): Event<DidStopInstallationParam> {
        return this.onDidInstallEmitter.event;
    }
    protected fireDidInstall(params: DidStopInstallationParam = { failed: false }): void {
        this.onDidInstallEmitter.fire(params);
    }

    async autoInstall(): Promise<void> {
        if (this.options.autoInstall) {
            await this.scheduleInstall();
        }
    }

    async needInstall(): Promise<boolean> {
        const installer = await this.installer();
        return installer.needInstall();
    }

    protected installed: Promise<void> = Promise.resolve();
    protected installationTokenSource = new CancellationTokenSource();
    async scheduleInstall(params: InstallParams = { force: false }): Promise<void> {
        if (this.installationTokenSource) {
            this.installationTokenSource.cancel();
        }
        this.installationTokenSource = new CancellationTokenSource();
        const token = this.installationTokenSource.token;
        this.installed = this.installed.then(() => this.install(params, token));
        await this.installed;
    }

    protected async install(params: InstallParams, token?: CancellationToken): Promise<void> {
        const installer = await this.installer(token);
        if (params.force || installer.needInstall()) {
            try {
                this.fireWillInstall();
                this.logger.info('Intalling the app...');
                await installer.install();

                this.logger.info('The app installation is finished');
                this.fireDidInstall();
                this.serverProcess.restart();
            } catch (err) {
                if (isCancelled(err)) {
                    this.logger.info('The app installation is cancelled');
                    return;
                }
                this.logger.info('The app installation is failed' + os.EOL, err);
                this.fireDidInstall({
                    failed: true
                });
            }
        } else {
            this.logger.info('Nothing to install');
        }
    }

    protected async installer(token?: CancellationToken): Promise<AppProjectInstaller> {
        const generator = await this.generator;
        return this.installerFactory({
            generator,
            projectPath: this.options.path,
            token
        });
    }

}
