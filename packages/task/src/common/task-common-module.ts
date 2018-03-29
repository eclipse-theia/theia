/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import { ILogger } from "@theia/core";

/**
 * Create the bindings common to node and browser.
 *
 * @param bind The bind function from inversify.
 */
export function createCommonBindings(bind: interfaces.Bind) {

    bind(ILogger).toDynamicValue(ctx => {
        const logger = ctx.container.get<ILogger>(ILogger);
        return logger.child({ 'module': 'task' });
    }).inSingletonScope().whenTargetNamed('task');
}
