/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ProjectOptions, Model } from "./generator-model";
import { WebpackGenerator } from "./webpack-generator";
import { BackendGenerator } from "./backend-generator";
import { FrontendGenerator } from "./frontend-generator";

export class CommonAppGenerator {

    protected readonly model: Model;
    protected readonly webpack: WebpackGenerator;
    protected readonly backend: BackendGenerator;
    protected readonly frontend: FrontendGenerator;

    constructor(options: ProjectOptions) {
        this.model = new Model(options);
        this.webpack = new WebpackGenerator(this.model)
        this.backend = new BackendGenerator(this.model);
        this.frontend = new FrontendGenerator(this.model);
    }

    async generate(): Promise<void> {
        await this.model.ready;
        this.webpack.generate();
        this.backend.generate();
        this.frontend.generate();
    }

}
