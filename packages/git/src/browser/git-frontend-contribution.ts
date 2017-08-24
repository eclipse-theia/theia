/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { GitWidget } from './git-widget';
import { FrontendApplication, FrontendApplicationContribution } from "@theia/core/lib/browser";

@injectable()
export class GitFrontendContribution implements FrontendApplicationContribution {

    constructor(
        @inject(GitWidget) protected readonly gitWidget: GitWidget,
    ) {
    }

    onStart(app: FrontendApplication): void {
        app.shell.addToLeftArea(this.gitWidget, {
            rank: 3
        });
    }

}

