/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution } from '@theia/core/lib/common';
import { MergeConflictsFrontendContribution } from './merge-conflicts-frontend-contribution';
import { MergeConflictsCodeLensProvider } from './merge-conflicts-code-lense-provider';
import { MergeConflictsParser } from './merge-conflicts-parser';
import { MergeConflictResolver } from './merge-conflict-resolver';
import { MergeConflictsProvider } from './merge-conflicts-provider';
import { MergeConflictsDecorations } from './merge-conflicts-decorations';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(MergeConflictsParser).toSelf().inSingletonScope();
    bind(MergeConflictResolver).toSelf().inSingletonScope();
    bind(MergeConflictsCodeLensProvider).toSelf().inSingletonScope();
    bind(MergeConflictsDecorations).toSelf().inSingletonScope();
    bind(MergeConflictsFrontendContribution).toSelf().inSingletonScope();
    bind(MergeConflictsProvider).toSelf().inSingletonScope();
    [CommandContribution, FrontendApplicationContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(MergeConflictsFrontendContribution)
    );
});
