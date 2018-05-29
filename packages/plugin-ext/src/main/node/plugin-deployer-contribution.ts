/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { BackendApplicationContribution } from "@theia/core/lib/node";
import { injectable, inject } from "inversify";
import { PluginDeployer } from "../../common/plugin-protocol";
import { ILogger } from "@theia/core";

@injectable()
export class PluginDeployerContribution implements BackendApplicationContribution {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(PluginDeployer)
    protected pluginDeployer: PluginDeployer;

    initialize() {
        this.pluginDeployer.start();
    }
}
