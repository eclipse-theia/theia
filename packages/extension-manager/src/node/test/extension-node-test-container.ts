/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { Container } from 'inversify';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { bindFileSystem, bindFileSystemWatcherServer } from '@theia/filesystem/lib/node/filesystem-backend-module';
import { ApplicationProjectArgs } from '../application-project-cli';
import { bindNodeExtensionServer } from '../extension-backend-module';

export const extensionNodeTestContainer = (args: ApplicationProjectArgs) => {
    const container = new Container();
    const bind = container.bind.bind(container);
    bindLogger(bind);
    bindFileSystem(bind);
    bindFileSystemWatcherServer(bind);
    bindNodeExtensionServer(bind, args);
    return container;
};
export default extensionNodeTestContainer;
