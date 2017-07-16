/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractFrontendGenerator, FileSystem } from "../common";

export class BrowserFrontendGenerator extends AbstractFrontendGenerator {

    generate(fs: FileSystem): void {
        this.doGenerate(fs, this.model.frontendModules);
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return super.compileIndexHead(frontendModules) + `
  <script type="text/javascript" src="./require.js" charset="utf-8"></script>`
    }

}