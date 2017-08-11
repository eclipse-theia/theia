/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { injectable, inject } from 'inversify';
import { CommonAppGenerator, ExtensionPackageDiff } from 'generator-theia';
import { ILogger, CancellationToken, checkCancelled } from "@theia/core";
import { NpmClient } from './npm-client';

export const AppProjectInstallerFactory = Symbol('AppProjectInstallerFactory');
export type AppProjectInstallerFactory = (options: AppProjectInstallerOptions) => AppProjectInstaller;

@injectable()
export class AppProjectInstallerOptions {
    readonly projectPath: string;
    readonly generator: CommonAppGenerator;
    readonly token?: CancellationToken;
}

@injectable()
export class AppProjectInstaller {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(NpmClient) protected readonly npmClient: NpmClient,
        @inject(AppProjectInstallerOptions) protected readonly options: AppProjectInstallerOptions
    ) { }

    needInstall(): boolean {
        const diff = this.diff();
        return !diff.empty;
    }

    async install(): Promise<void> {
        const diff = this.diff();
        this.logger.info('The diff to install: ', JSON.stringify({
            toAdd: [...diff.toAdd],
            toRemove: [...diff.toRemove.values()],
            toLink: [...diff.toLink],
            toUnlink: [...diff.toUnlink.values()]
        }, undefined, 2));

        try {
            checkCancelled(this.options.token);
            this.logger.info('Installing app extensions...');
            await this.installExtensions();
            this.logger.info('App extensions are installed');

            checkCancelled(this.options.token);
            this.logger.info('Generating the app...');
            await this.generate();
            this.logger.info('The app generation is finished');

            checkCancelled(this.options.token);
            this.logger.info('Building the app...');
            await this.build();
            this.logger.info('The app is built');
        } catch (err) {
            await this.rollback();
            throw err;
        }
    }

    rollback(): Promise<void> {
        return fs.writeJSON(path.resolve(this.projectPath, 'package.json'), this.options.generator.model.targetPck, {
            spaces: 2
        });
    }

    async generate(): Promise<void> {
        const generator = this.options.generator;
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

    async installExtensions(): Promise<void> {
        const model = this.options.generator.model;
        const nodeModulesPath = path.resolve(this.projectPath, model.defaultConfig.node_modulesPath);

        const diff = this.diff();
        for (const name of diff.toUnlink) {
            const destPackagePath = path.resolve(nodeModulesPath, name);

            checkCancelled(this.options.token);
            try {
                await fs.unlink(destPackagePath);
            } catch (e) { }
        }
        for (const name of diff.toRemove) {
            const destPackagePath = path.resolve(nodeModulesPath, name);

            checkCancelled(this.options.token);
            await fs.remove(destPackagePath);
        }
        for (const [name, localPath] of diff.toLink.entries()) {
            const srcPackagePath = path.resolve(this.projectPath, localPath);
            const destPackagePath = path.resolve(nodeModulesPath, name);

            checkCancelled(this.options.token);
            await fs.ensureSymlink(srcPackagePath, destPackagePath, 'dir');
        }
        for (const [name, version] of diff.toAdd.entries()) {
            await this.npm('add', [`${name}@${version}`]);
        }

        const binSrcPath = path.resolve(this.projectPath, model.config.node_modulesPath, '.bin');
        const binDestPath = path.resolve(nodeModulesPath, '.bin');
        if (binSrcPath !== binDestPath) {
            checkCancelled(this.options.token);
            await fs.ensureSymlink(binSrcPath, binDestPath, 'dir');
        } else {
            await this.npm('install', []);
        }
    }

    build(): Promise<void> {
        return this.npm('run', ['build']);
    }

    protected npm(command: string, args: string[], projectPath: string = this.projectPath): Promise<void> {
        return this.npmClient.execute(projectPath, command, args, this.options.token);
    }

    protected get projectPath(): string {
        return this.options.projectPath;
    }

    protected diff(): ExtensionPackageDiff {
        const generator = this.options.generator;
        return generator.model.diff;
    }

}
