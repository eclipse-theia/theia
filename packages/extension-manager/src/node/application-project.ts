/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as os from 'os';
import * as paths from 'path';
import * as fs from 'fs-extra';
import { injectable, inject } from 'inversify';
import { ApplicationPackageOptions, NpmRegistry } from '@theia/application-package';
import { ApplicationPackageManager } from '@theia/application-manager';
import {
    Disposable, DisposableCollection, Event, Emitter, ILogger,
    CancellationTokenSource, CancellationToken, isCancelled, checkCancelled
} from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { FileSystemWatcherServer, DidFilesChangedParams } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { InstallationResult, InstallationParam } from '../common/extension-protocol';
import { NpmClient } from './npm-client';

@injectable()
export class ApplicationProjectOptions extends ApplicationPackageOptions {
    readonly autoInstall: boolean;
    readonly watchRegistry: boolean;
}

@injectable()
export class ApplicationProject implements Disposable {

    protected readonly packageUri: string;
    protected readonly toDispose = new DisposableCollection();
    protected readonly onChangePackageEmitter = new Emitter<void>();
    protected readonly onWillInstallEmitter = new Emitter<InstallationParam>();
    protected readonly onDidInstallEmitter = new Emitter<InstallationResult>();
    protected readonly registry: NpmRegistry;

    constructor(
        @inject(ApplicationProjectOptions) readonly options: ApplicationProjectOptions,
        @inject(FileSystemWatcherServer) protected readonly fileSystemWatcher: FileSystemWatcherServer,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(NpmClient) protected readonly npmClient: NpmClient,
    ) {
        logger.debug('AppProjectOptions', options);
        this.registry = new NpmRegistry({
            watchChanges: this.options.watchRegistry
        });
        this.backup();
        this.packageUri = FileUri.create(this.packagePath).toString();
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
            error: this.logger.error.bind(this.logger),
            registry: this.registry
        }, this.options));
    }

    get onWillInstall(): Event<InstallationParam> {
        return this.onWillInstallEmitter.event;
    }
    protected fireWillInstall(param: InstallationParam): void {
        this.onWillInstallEmitter.fire(param);
    }

    get onDidInstall(): Event<InstallationResult> {
        return this.onDidInstallEmitter.event;
    }
    protected fireDidInstall(result: InstallationResult): void {
        this.onDidInstallEmitter.fire(result);
    }

    protected async autoInstall(): Promise<void> {
        if (this.options.autoInstall) {
            await this.scheduleInstall();
        }
    }

    protected installed: Promise<void> = Promise.resolve();
    protected installationTokenSource = new CancellationTokenSource();
    async scheduleInstall(): Promise<void> {
        if (this.installationTokenSource) {
            this.installationTokenSource.cancel();
        }
        this.installationTokenSource = new CancellationTokenSource();
        const token = this.installationTokenSource.token;
        this.installed = this.installed.then(() => this.install(token));
        await this.installed;
    }

    protected async install(token?: CancellationToken): Promise<void> {
        const reverting = this.reverting;
        try {
            this.fireWillInstall({ reverting });
            this.logger.info('Intalling the app...');

            await this.build(token);
            await this.restart(token);

            this.backup();
            this.logger.info('The app installation is finished');
            this.fireDidInstall({
                reverting,
                failed: false
            });
        } catch (error) {
            if (isCancelled(error)) {
                this.logger.info('The app installation is cancelled');
                return;
            }
            this.logger.error('The app installation is failed' + os.EOL, error);
            this.fireDidInstall({
                reverting,
                failed: true
            });
            this.revert(token);
        }
    }

    protected restart(token?: CancellationToken): Promise<void> {
        checkCancelled(token);
        return Promise.resolve();
    }

    protected async build(token?: CancellationToken): Promise<void> {
        this.logger.info('Installing extensions...');
        await this.prepareBuild(token);
        this.logger.info('Extensions are installed');

        this.logger.info('Building the app...');
        await this.doBuild(token);
        this.logger.info('The app is built');
    }
    protected prepareBuild(token?: CancellationToken): Promise<void> {
        checkCancelled(token);
        return this.npmClient.execute(this.options.projectPath, 'install', [], token);
    }
    protected doBuild(token?: CancellationToken): Promise<void> {
        checkCancelled(token);
        const manager = this.createPackageManager();
        const scripts = manager.pck.pck.scripts;
        if (scripts) {
            if ('prepare' in scripts) {
                return Promise.resolve();
            }
            if ('build' in scripts) {
                return this.npmClient.execute(this.options.projectPath, 'build', [], token);
            }
        }
        if (manager.process.canRun('theia')) {
            return manager.process.run('theia', ['build']);
        }
        return manager.build();
    }

    protected get reverting(): boolean {
        const packagePath = this.packagePath;
        if (!fs.existsSync(packagePath)) {
            return false;
        }
        const backupPath = this.backupPath;
        if (!fs.existsSync(backupPath)) {
            return false;
        }
        const packageContent = fs.readFileSync(packagePath, { encoding: 'utf-8' });
        const backupContent = fs.readFileSync(backupPath, { encoding: 'utf-8' });
        return packageContent === backupContent;
    }
    protected backup(): void {
        const packagePath = this.packagePath;
        if (fs.existsSync(packagePath)) {
            fs.copySync(packagePath, this.backupPath);
        }
    }
    protected revert(token?: CancellationToken): void {
        checkCancelled(token);
        try {
            this.logger.info('Reverting the app installation ...');
            const backupPath = this.backupPath;
            if (fs.existsSync(backupPath)) {
                fs.copySync(backupPath, this.packagePath);
            }
        } catch (error) {
            if (isCancelled(error)) {
                this.logger.info('Reverting the app installation is cancelled');
                return;
            }
            this.logger.error('Reverting the app installation is failed' + os.EOL, error);
        }
    }
    protected get backupPath(): string {
        return paths.resolve(this.options.projectPath, 'package-backup.json');
    }

    protected get packagePath(): string {
        return paths.resolve(this.options.projectPath, 'package.json');
    }

}
