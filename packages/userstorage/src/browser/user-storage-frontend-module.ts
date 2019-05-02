/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { ContainerModule, interfaces, } from 'inversify';
import { ResourceResolver } from '@theia/core/lib/common';
import { UserStorageResolver } from './user-storage-resource';
import { UserStorageServiceFilesystemImpl } from './user-storage-service-filesystem';
import { UserStorageService } from './user-storage-service';

export function bindUserStorage(bind: interfaces.Bind): void {
    bind(ResourceResolver).to(UserStorageResolver).inSingletonScope();
    bind(UserStorageService).to(UserStorageServiceFilesystemImpl).inSingletonScope();
}

export default new ContainerModule(bind => {
    bindUserStorage(bind);
});
