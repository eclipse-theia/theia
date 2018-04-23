/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { bindContributionProvider } from "@theia/core/lib/common/contribution-provider";
import { HostedPluginManager, NodeHostedPluginRunner } from './hosted-plugin-manager';
import { bindCommonPart } from "./plugin-api-backend-module";
import { HostedPluginUriPostProcessor } from "./hosted-plugin-uri-postprocessor";

export default new ContainerModule(bind => {
    bind(HostedPluginManager).to(NodeHostedPluginRunner).inSingletonScope();
    bindContributionProvider(bind, HostedPluginUriPostProcessor);

    bindCommonPart(bind);
});
