/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { HostedPluginManager, ElectronNodeHostedPluginRunner } from '../node/hosted-plugin-manager';
import { interfaces } from 'inversify';
import { bindCommonHostedBackend } from '../node/plugin-ext-hosted-backend-module';

export function bindElectronBackend(bind: interfaces.Bind): void {
    bind(HostedPluginManager).to(ElectronNodeHostedPluginRunner);
    bindCommonHostedBackend(bind);
}
