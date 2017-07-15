/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractAppGenerator } from "../common";
import { ExtensionPackageGenerator } from "./extension-package-generator";

export class TheiaExtensionGenerator extends AbstractAppGenerator {

    protected readonly pck = new ExtensionPackageGenerator(this.model);

    initializing(): void {
        super.initializing('extension', {});
    }

    configuring(): void {
        // no-op
    }

    writing(): void {
        this.pck.generate(this.fs);
    }

}