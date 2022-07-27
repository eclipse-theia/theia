// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
import {
    PluginDeployerFileHandler, PluginDeployerDirectoryHandler, PluginScanner, PluginDeployerParticipant, PluginDeployerResolver
} from '@theia/plugin-ext';
import { PluginVsCodeFileHandler } from './plugin-vscode-file-handler';
import { PluginVsCodeDirectoryHandler } from './plugin-vscode-directory-handler';
import { VsCodePluginScanner } from './scanner-vscode';
import { PluginVsCodeCliContribution } from './plugin-vscode-cli-contribution';
import { BackendApplicationContribution, CliContribution } from '@theia/core/lib/node';
import { PluginHostEnvironmentVariable } from '@theia/plugin-ext/lib/common';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { PluginVSCodeDeployerParticipant } from './plugin-vscode-deployer-participant';
import { HostedPluginReader } from './plugin-reader';
import { LocalVSIXFilePluginDeployerResolver } from './local-vsix-file-plugin-deployer-resolver';

export default new ContainerModule(bind => {
    bind(PluginVSCodeEnvironment).toSelf().inSingletonScope();

    bind(PluginVSCodeDeployerParticipant).toSelf().inSingletonScope();
    bind(PluginDeployerParticipant).toService(PluginVSCodeDeployerParticipant);

    bind(PluginDeployerFileHandler).to(PluginVsCodeFileHandler).inSingletonScope();
    bind(PluginDeployerDirectoryHandler).to(PluginVsCodeDirectoryHandler).inSingletonScope();
    bind(PluginScanner).to(VsCodePluginScanner).inSingletonScope();

    bind(PluginVsCodeCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(PluginVsCodeCliContribution);
    bind(PluginHostEnvironmentVariable).toService(PluginVsCodeCliContribution);

    bind(HostedPluginReader).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(HostedPluginReader);

    bind(PluginDeployerResolver).to(LocalVSIXFilePluginDeployerResolver).inSingletonScope();
});
