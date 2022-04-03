// *****************************************************************************
// Copyright (C) 2017-2018 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendAndFrontend, ServiceContribution } from '@theia/core/lib/common';
import { SearchInWorkspaceServer, SIW_WS_PATH } from '../common/search-in-workspace-interface';
import { RipgrepSearchInWorkspaceServer, RgPath } from './ripgrep-search-in-workspace-server';
import { rgPath } from 'vscode-ripgrep';

export default new ContainerModule(bind => {
    bind(SearchInWorkspaceServer).to(RipgrepSearchInWorkspaceServer);
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [SIW_WS_PATH, () => ctx.container.get(SearchInWorkspaceServer)]
        ))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    bind(RgPath).toConstantValue(rgPath);
});
