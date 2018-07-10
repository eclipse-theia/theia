/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
