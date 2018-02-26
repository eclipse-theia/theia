/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser";
import { DirtyDiffManager } from './dirty-diff-manager';
import { DirtyDiffDecorator } from './dirty-diff-decorator';

@injectable()
export class DirtyDiffContribution implements FrontendApplicationContribution {

    constructor(
        @inject(DirtyDiffManager) protected readonly dirtyDiffManager: DirtyDiffManager,
        @inject(DirtyDiffDecorator) protected readonly dirtyDiffDecorator: DirtyDiffDecorator,
    ) { }

    onStart(app: FrontendApplication): void {
        this.dirtyDiffManager.onDirtyDiffUpdate(update => this.dirtyDiffDecorator.applyDecorations(update));
    }

}
