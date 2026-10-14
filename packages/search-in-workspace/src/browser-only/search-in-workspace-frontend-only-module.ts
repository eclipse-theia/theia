// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { SearchInWorkspaceServer } from '../common/search-in-workspace-interface.js';
import { BrowserSearchInWorkspaceServer } from './browser-search-in-workspace-server.js';
import { SearchInWorkspaceService } from '../browser/search-in-workspace-service.js';
import { BrowserOnlySearchInWorkspaceService } from './browser-only-search-in-workspace-service.js';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    if (isBound(SearchInWorkspaceServer)) {
        rebind(SearchInWorkspaceServer).to(BrowserSearchInWorkspaceServer).inSingletonScope();
    } else {
        bind(SearchInWorkspaceServer).to(BrowserSearchInWorkspaceServer).inSingletonScope();
    }

    if (isBound(SearchInWorkspaceService)) {
        rebind(SearchInWorkspaceService).to(BrowserOnlySearchInWorkspaceService).inSingletonScope();
    } else {
        bind(SearchInWorkspaceService).to(BrowserOnlySearchInWorkspaceService).inSingletonScope();
    }
});
