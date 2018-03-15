/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from "inversify";
import {
    DebugConfigurationProvider,
    DebugConfigurationProviderRegistry,
    DebugConfigurationContribution,
    DebugConfiguration
} from "@theia/debug/lib/common/debug-model";

/**
 * NodeJs debug type.
 */
export const NODEJS_DEBUG_ID = "Node Js";

/**
 * NodeJsDebugConfigurationProvider symbol for DI.
 */
export const NodeJsDebugConfigurationProvider = Symbol('NodeJsDebugConfigurationProvider');

/**
 * NodeJs configuration provider.
 */
export interface NodeJsDebugConfigurationProvider extends DebugConfigurationProvider {
}

/**
 * NodeJsDebugConfigurationProvider implementation.
 */
@injectable()
export class NodeJSDebugConfigurationProviderImpl implements NodeJsDebugConfigurationProvider {
    debugAdapterExecutable(config: DebugConfiguration) {
        throw new Error("Method not implemented.");
    }

    resolveDebugConfiguration(config: DebugConfiguration) {
        return config;
    }

    provideDebugConfigurations() {
        return [new NodeJsDebugConfiguration()];
    }
}

/**
 * Registers NodeJs [debug configuration provider](#NodeJsDebugConfigurationProvider)
 * and [session factory](#NodeJsDebugSessionFactory).
 */
@injectable()
export class NodeJsDebugRegistrator implements DebugConfigurationContribution {
    @inject(NodeJsDebugConfigurationProvider)
    protected readonly provider: NodeJsDebugConfigurationProvider;

    registerDebugConfigurationProvider(registry: DebugConfigurationProviderRegistry) {
        registry.registerDebugConfigurationProvider(NODEJS_DEBUG_ID, this.provider);
    }
}

export class NodeJsDebugConfiguration implements DebugConfiguration {
    [key: string]: any;
    type: string;
    name: string;
}
