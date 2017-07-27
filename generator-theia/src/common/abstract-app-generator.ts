/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as process from 'process';
import * as cp from 'child_process';
import BaseGenerator = require('yeoman-generator');

import { Model } from "./generator-model";
import { AppPackageGenerator } from "./app-package-generator";

export abstract class AbstractAppGenerator extends BaseGenerator {

    protected readonly model = new Model();
    protected readonly pck = new AppPackageGenerator(this.model);

    initializing(): void {
        this.model.targetPck = this.fs.readJSON(this.destinationPath('package.json'), {});
        this.model.pck = this.fs.readJSON(this.destinationPath('theia.package.json'), {});
        this.config.defaults(this.model.config);
        Object.assign(this.model.config, this.config.getAll());
    }

    configuring(): void {
        this.config.save();
        this.model.readExtensionPackages({
            read: (extension, version) => this.info(`${extension}@${version}`),
            readLocal: (extension, path) => {
                for (const packagePath of ['package.json', 'extension.package.json']) {
                    const extensionPackagePath = this.destinationPath(path, packagePath);
                    if (this.fs.exists(extensionPackagePath)) {
                        return this.fs.readJSON(extensionPackagePath, undefined);
                    }
                }
                return undefined;
            }
        });
    }

    protected version(pck: string): string | undefined {
        return this.info(pck, 'version');
    }

    protected info(pck: string, ...viewArgs: string[]): any | undefined {
        const raw = ['npm', 'view', pck, '--json', ...viewArgs];
        const args = process.platform === 'win32' ? ['cmd', '/c', ...raw] : raw;
        try {
            return JSON.parse(cp.execSync(args.join(' '), {
                encoding: 'utf8'
            }));
        } catch (e) {
            console.error(e);
            return undefined;
        }
    }

    writing(): void {
        this.pck.generate(this.fs);
    }

}