/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import BaseGenerator = require('yeoman-generator');
import { ProjectModel } from "../common";
import { ExtensionPackageGenerator } from "./extension-package-generator";
export class TheiaExtensionGenerator extends BaseGenerator {

    protected readonly model = new ProjectModel();
    protected readonly pck = new ExtensionPackageGenerator(this.model);

    initializing(): void {
        this.model.pck = this.fs.readJSON(`extension.package.json`) || {};
        this.config.defaults(this.model.defaultExtensionConfig);
        Object.assign(this.model.extensionConfig, this.config.getAll());
    }

    configuring(): void {
        this.config.save();
    }

    writing(): void {
        this.pck.generate(this.fs);
    }

}