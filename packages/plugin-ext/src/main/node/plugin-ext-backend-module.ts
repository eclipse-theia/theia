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

import { interfaces } from "inversify";
import { PluginApiContribution } from "./plugin-service";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { PluginDeployerContribution } from "./plugin-deployer-contribution";
import {
    PluginDeployer, PluginDeployerResolver, PluginDeployerFileHandler,
    PluginDeployerDirectoryHandler, PluginServer, pluginServerJsonRpcPath
} from "../../common/plugin-protocol";
import { PluginDeployerImpl } from "./plugin-deployer-impl";
import { LocalDirectoryPluginDeployerResolver } from "./resolvers/plugin-local-dir-resolver";
import { PluginTheiaFileHandler } from "./handlers/plugin-theia-file-handler";
import { PluginTheiaDirectoryHandler } from "./handlers/plugin-theia-directory-handler";
import { GithubPluginDeployerResolver } from "./plugin-github-resolver";
import { HttpPluginDeployerResolver } from "./plugin-http-resolver";
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core";

export function bindMainBackend(bind: interfaces.Bind): void {
    bind(PluginApiContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(PluginApiContribution)).inSingletonScope();

    bind(PluginDeployer).to(PluginDeployerImpl).inSingletonScope();
    bind(PluginDeployerContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(PluginDeployerContribution)).inSingletonScope();

    bind(PluginDeployerResolver).to(LocalDirectoryPluginDeployerResolver).inSingletonScope();
    bind(PluginDeployerResolver).to(GithubPluginDeployerResolver).inSingletonScope();
    bind(PluginDeployerResolver).to(HttpPluginDeployerResolver).inSingletonScope();

    bind(PluginDeployerFileHandler).to(PluginTheiaFileHandler).inSingletonScope();
    bind(PluginDeployerDirectoryHandler).to(PluginTheiaDirectoryHandler).inSingletonScope();

    bind(PluginServer).to(PluginDeployerImpl).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(pluginServerJsonRpcPath, () =>
            ctx.container.get(PluginServer)
        )
    ).inSingletonScope();
}
