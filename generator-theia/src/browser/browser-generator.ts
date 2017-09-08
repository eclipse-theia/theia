/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractAppGenerator } from "../common";
import { BrowserBackendGenerator } from "./browser-backend-generator";
import { BrowserFrontendGenerator } from "./browser-frontend-generator";

export class TheiaBrowserGenerator extends AbstractAppGenerator {

    protected readonly backend = new BrowserBackendGenerator(this.model);
    protected readonly frontend = new BrowserFrontendGenerator(this.model);

    initializing(): void {
        this.model.target = 'web';
        super.initializing();
    }

    configuring(): Promise<void> {
        return super.configuring();
    }

    writing(): void {
        super.writing();
        this.backend.generate(this.fs);
        this.frontend.generate(this.fs);
    }

}