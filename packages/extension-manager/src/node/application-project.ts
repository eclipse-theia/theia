/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import * as fs from 'fs-extra';
import * as paths from 'path';
import { injectable, inject } from 'inversify';
import { ApplicationPackageManager, ApplicationPackageOptions } from '@theia/application-package';
import {
    Disposable, DisposableCollection, Event, Emitter, ILogger,
    CancellationTokenSource, CancellationToken, isCancelled, checkCancelled
} from "@theia/core";
import { FileUri, ServerProcess } from "@theia/core/lib/node";
import { FileSystemWatcherServer, DidFilesChangedParams } from "@theia/filesystem/lib/common/filesystem-watcher-protocol";
import { DidStopInstallationParam } from '../common/extension-protocol';
import { NpmClient } from './npm-client';

@injectable()
export class ApplicationProjectOptions extends ApplicationPackageOptions {
    readonly autoInstall: boolean;
}

export class ApplicationInstallParams {
    readonly force: boolean;
}

@injectable()
export class ApplicationProject implements Disposable {

    protected readonly packageUri: string;
    protected readonly toDispose = new DisposableCollection();
    protected readonly onChangePackageEmitter = new Emitter<void>();
    protected readonly onWillInstallEmitter = new Emitter<void>();
    protected readonly onDidInstallEmitter = new Emitter<DidStopInstallationParam>();

    constructor(
        @inject(ApplicationProjectOptions) readonly options: ApplicationProjectOptions,
        @inject(FileSystemWatcherServer) protected readonly fileSystemWatcher: FileSystemWatcherServer,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(NpmClient) protected readonly npmClient: NpmClient,
        @inject(ServerProcess) protected readonly serverProcess: ServerProcess
    ) {
        logger.debug('AppProjectOptions', options);
        this.packageUri = FileUri.create(this.currentPackagePath).toString();
        this.toDispose.push(this.fileSystemWatcher);
        this.fileSystemWatcher.setClient({
            onDidFilesChanged: changes => this.onDidFilesChanged(changes)
        });
        this.fileSystemWatcher.watchFileChanges(this.packageUri).then(watcher =>
            this.toDispose.push(Disposable.create(() =>
                this.fileSystemWatcher.unwatchFileChanges(watcher)
            ))
        );
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
    protected isPackageChanged(param: DidFilesChangedParams): boolean {
        return param.changes.some(change => change.uri === this.packageUri);
    }
    protected onDidFilesChanged(param: DidFilesChangedParams): void {
        if (this.isPackageChanged(param)) {
            this.fireDidChangePackage();
            this.autoInstall();
        }
    }

    createPackageManager(): ApplicationPackageManager {
        return new ApplicationPackageManager(Object.assign({
            log: this.logger.info.bind(this.logger),
            error: this.logger.error.bind(this.logger)
        }, this.options));
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

    needInstall(): boolean {
        const currentPath = this.currentPackagePath;
        if (!fs.existsSync(currentPath)) {
            return false;
        }
        const previousPath = this.previousPackagePath;
        if (!fs.existsSync(previousPath)) {
            return true;
        }
        const content = fs.readFileSync(currentPath).toString();
        const previousContent = fs.readFileSync(previousPath).toString();
        return content !== previousContent;
    }

    protected installed: Promise<void> = Promise.resolve();
    protected installationTokenSource = new CancellationTokenSource();
    async scheduleInstall(params: ApplicationInstallParams = { force: false }): Promise<void> {
        if (this.installationTokenSource) {
            this.installationTokenSource.cancel();
        }
        this.installationTokenSource = new CancellationTokenSource();
        const token = this.installationTokenSource.token;
        this.installed = this.installed.then(() => this.install(params, token));
        await this.installed;
    }

    protected async install(params: ApplicationInstallParams, token?: CancellationToken): Promise<void> {
        if (params.force || this.needInstall()) {
            try {
                this.fireWillInstall();
                this.logger.info('Intalling the app...');
                await this.build(token);

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

    protected async build(token?: CancellationToken): Promise<void> {
        this.logger.info('Installing extensions...');
        await this.prepareBuild(token);
        this.logger.info('Extensions are installed');

        this.logger.info('Building the app...');
        await this.doBuild(token);
        this.logger.info('The app is built');

        await this.saveBuild();
    }

    protected prepareBuild(token?: CancellationToken): Promise<void> {
        checkCancelled(token);
        return this.npmClient.execute(this.options.projectPath, 'install', ['--ignore-scripts'], token);
    }

    protected doBuild(token?: CancellationToken): Promise<void> {
        checkCancelled(token);
        const manager = this.createPackageManager();
        const scripts = manager.pck.pck.scripts;
        if (scripts && ('build' in scripts)) {
            return this.npmClient.execute(this.options.projectPath, 'build', [], token);
        }
        if (manager.process.canRun('theia')) {
            return manager.process.run('theia', ['build:' + this.options.target]);
        }
        return manager.build();
    }

    protected async saveBuild(): Promise<void> {
        const current = this.currentPackagePath;
        const previous = this.previousPackagePath;
        await fs.copy(current, previous);
    }

    protected get currentPackagePath(): string {
        return paths.resolve(this.options.projectPath, 'package.json');
    }
    protected get previousPackagePath(): string {
        return paths.resolve(this.options.projectPath, 'theia.package.json');
    }

}
