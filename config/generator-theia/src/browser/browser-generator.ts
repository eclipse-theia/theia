/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import BaseGenerator = require('yeoman-generator');
import { BrowserBackendGenerator } from "./browser-backend-generator";

export class TheiaBrowserGenerator extends BaseGenerator {

    protected readonly backend = new BrowserBackendGenerator();

    writing(): void {
        this.fs.write('browser/src/backend.ts', this.backend.generate({
            frontendModules: {},
            backendModules: {
                "fileSystemBackendModule": "theia-core/lib/filesystem/node",
                "workspaceBackendModule": "theia-core/lib/workspace/node",
                "terminalBackendModule": "theia-core/lib/terminal/node",
                "languagesBackendModule": "theia-core/lib/languages/node",
                "javaBackendModule": "theia-core/lib/java/node",
                "pythonBackendModule": "theia-core/lib/python/node",
                "cppBackendModule": "theia-core/lib/cpp/node"
            }
        }));
    }

}