/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core';
import { PluginVscodeCommandsContribution } from './plugin-vscode-commands-contribution';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { PluginVSCodeContribution } from './plugin-vscode-contribution';
import { FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';

export default new ContainerModule(bind => {
    bind(PluginVSCodeEnvironment).toSelf().inSingletonScope();
    bind(PluginVscodeCommandsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(PluginVscodeCommandsContribution);
    bind(PluginVSCodeContribution).toSelf().inSingletonScope();
    bind(FileServiceContribution).toService(PluginVSCodeContribution);
});
