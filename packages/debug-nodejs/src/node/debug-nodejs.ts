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
    DebugConfigurationRegistry,
    DebugConfigurationContribution,
    DebugSessionFactoryContribution,
    DebugSessionFactoryRegistry,
    DebugSessionFactory
} from "@theia/debug/lib/common/debug-server";
import { DebugConfiguration } from "@theia/debug/lib/common/debug-model";

/**
 * Node JS debugger type.
 */
export const NodeJs = "Node JS";

@injectable()
export class NodeJSDebugConfigurationProvider implements DebugConfigurationProvider {
    resolveDebugConfiguration(config: DebugConfiguration) {
        return undefined;
    }

    provideDebugConfigurations() {
        return [];
    }
}

@injectable()
export class NodeJsDebugSessionFactory implements DebugSessionFactory {
    create(config: DebugConfiguration) {
        return undefined;
    }
}

@injectable()
export class NodeJsDebugRegistrator implements DebugConfigurationContribution, DebugSessionFactoryContribution {
    @inject(DebugSessionFactory)
    protected readonly factory: DebugSessionFactory;

    @inject(DebugConfigurationProvider)
    protected readonly provider: DebugConfigurationProvider;

    registerDebugSessionFactory(registry: DebugSessionFactoryRegistry) {
        registry.registerDebugSessionFactory(NodeJs, this.factory);
    }
    registerDebugConfigurationProvider(registry: DebugConfigurationRegistry) {
        registry.registerDebugConfigurationProvider(NodeJs, this.provider);
    }
}
