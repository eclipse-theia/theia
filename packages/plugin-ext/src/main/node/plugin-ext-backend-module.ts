/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import { PluginApiContribution } from "./plugin-service";
import { BackendApplicationContribution } from "@theia/core/lib/node";

export function bindMainBackend(bind: interfaces.Bind): void {
    bind(PluginApiContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(PluginApiContribution)).inSingletonScope();
}
