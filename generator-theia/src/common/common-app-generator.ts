/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import BaseGenerator = require('yeoman-generator');

import { ProjectModel } from "./generator-model";
import { AppPackageGenerator } from "./app-package-generator";

export class CommonAppGenerator extends BaseGenerator {

    readonly model = new ProjectModel();
    protected readonly pck = new AppPackageGenerator(this.model);

    initializing(): void {
        this.model.targetPck = this.fs.readJSON(this.destinationPath('package.json'), {});
        this.model.pckPath = this.destinationPath('theia.package.json');
        this.model.pck = this.fs.readJSON(this.model.pckPath, {});
        this.config.defaults(this.model.defaultConfig);
        Object.assign(this.model.config, this.config.getAll());
    }

    configuring(): Promise<void> {
        this.config.save();
        return this.model.readExtensionPackages((extension, path) => {
            for (const packagePath of ['package.json', 'extension.package.json']) {
                const extensionPackagePath = this.destinationPath(path, packagePath);
                if (this.fs.exists(extensionPackagePath)) {
                    const pck = this.fs.readJSON(extensionPackagePath, undefined);
                    if (pck && pck.name === extension) {
                        return pck;
                    }
                    return undefined;
                }
            }
            return undefined;
        });
    }

    writing(): void {
        this.pck.generate(this.fs);
    }

}
