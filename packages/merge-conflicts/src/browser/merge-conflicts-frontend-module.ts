/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution } from '@theia/core/lib/common';
import { MergeConflictsFrontendContribution } from './merge-conflicts-frontend-contribution';
import { MergeConflictsCodeLensProvider } from './merge-conflicts-code-lense-provider';
import { MergeConflictsParser } from './merge-conflicts-parser';
import { MergeConflictResolver } from './merge-conflict-resolver';
import { MergeConflictsService } from './merge-conflicts-service';
import { MergeConflictsDecorations } from './merge-conflicts-decorations';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(MergeConflictsParser).toSelf().inSingletonScope();
    bind(MergeConflictResolver).toSelf().inSingletonScope();
    bind(MergeConflictsCodeLensProvider).toSelf().inSingletonScope();
    bind(MergeConflictsDecorations).toSelf().inSingletonScope();
    bind(MergeConflictsFrontendContribution).toSelf().inSingletonScope();
    bind(MergeConflictsService).toSelf().inSingletonScope();
    [CommandContribution, FrontendApplicationContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(c => c.container.get(MergeConflictsFrontendContribution)).inSingletonScope()
    );
});
