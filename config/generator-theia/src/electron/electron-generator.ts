/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractAppGenerator } from "../common";
import { ElectronPackageGenerator } from "./electron-package-generator";
import { ElectronBackendGenerator } from "./electron-backend-generator";
import { ElectronFrontendGenerator } from "./electron-frontend-generator";

export class TheiaElectronGenerator extends AbstractAppGenerator {

    protected readonly pck = new ElectronPackageGenerator(this.model);
    protected readonly backend = new ElectronBackendGenerator(this.model);
    protected readonly frontend = new ElectronFrontendGenerator(this.model);

    initializing(): void {
        super.initializing();
    }

    configuring(): void {
        super.configuring();
    }

    writing(): void {
        this.pck.generate(this.fs);
        this.backend.generate(this.fs);
        this.frontend.generate(this.fs);
    }

    install(): void {
        super.install();
    }

}