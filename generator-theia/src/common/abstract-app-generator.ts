/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as paths from 'path';
import * as process from 'process';
import * as cp from 'child_process';
import BaseGenerator = require('yeoman-generator');

import { Model } from "./generator-model";
import { AppPackageGenerator } from "./app-package-generator";

export abstract class AbstractAppGenerator extends BaseGenerator {

    protected readonly model = new Model();
    protected readonly pck = new AppPackageGenerator(this.model);

    initializing(): void {
        this.model.pck = this.fs.readJSON('theia.package.json') || {};
        this.config.defaults(this.model.config);
        Object.assign(this.model.config, this.config.getAll());
    }

    configuring(): void {
        this.config.save();
        this.model.readLocalExtensionPackages((extension, path) => {
            const extensionPath = paths.join(process.cwd(), path, 'extension.package.json');
            if (this.fs.exists(extensionPath)) {
                return this.fs.readJSON(extensionPath, undefined);
            }
            const extensionPackagePath = paths.join(process.cwd(), path, 'package.json');
            return this.fs.readJSON(extensionPackagePath, undefined);
        })
        this.model.readExtensionPackages((extension, version) => {
            const raw = ['yarn', 'info', `${extension}@${version}`, '--json'];
            const args = process.platform === 'win32' ? ['cmd', '/c', ...raw] : raw;
            return JSON.parse(cp.execSync(args.join(' '), {
                encoding: 'utf8'
            }));
        });
    }

    writing(): void {
        this.pck.generate(this.fs);
    }

}