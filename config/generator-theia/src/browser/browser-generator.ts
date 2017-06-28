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
import { BrowserPackageGenerator } from "./browser-package-generator";
import { BrowserBackendGenerator } from "./browser-backend-generator";
import { BrowserFrontendGenerator } from "./browser-frontend-generator";

export const NPM = require('check-if-windows') ? 'npm.cmd' : 'npm';

export class TheiaBrowserGenerator extends BaseGenerator {

    protected readonly model = new Model();
    protected readonly pck = new BrowserPackageGenerator(this.model);
    protected readonly backend = new BrowserBackendGenerator(this.model);
    protected readonly frontend = new BrowserFrontendGenerator(this.model);

    initializing(): void {
        this.model.pck = this.fs.readJSON('theia.package.json') || {};
    }

    configuring(): void {
        this.model.readLocalExtensionPackages((extension, path) => {
            const extensionPath = paths.join(process.cwd(), `${path}/package.json`);
            console.log(extensionPath);
            return this.fs.readJSON(extensionPath, undefined);
        })
        this.model.readExtensionPackages((extension, version) => {
            return JSON.parse(cp.execSync([NPM, 'view', `${extension}@${version}`, '--json'].join(' '), {
                encoding: 'utf8'
            }));
        });
    }

    writing(): void {
        this.pck.generate(this.fs);
        this.backend.generate(this.fs);
        this.frontend.generate(this.fs);
    }

    install(): void {
        this.spawnCommandSync('npm', ['run', 'bootstrap']);
    }

}