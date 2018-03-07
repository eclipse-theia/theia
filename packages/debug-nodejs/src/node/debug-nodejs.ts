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
    DebugSessionFactoryContribution,
    DebugSessionFactoryRegistry,
    DebugSessionFactory,
    DebugSession,
    DebugConfiguration
} from "@theia/debug/lib/common/debug-server";
import { Debug } from "@theia/debug/lib/common/debug-model";
import { ILogger } from "@theia/core";
import { DebugProtocol } from "vscode-debugprotocol/lib/debugProtocol";

/**
 * NodeJs debugger type.
 */
export const NODEJS = "Node Js";

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
    resolveDebugConfiguration(config: DebugConfiguration) {
        return config;
    }

    provideDebugConfigurations() {
        return [new NodeJsDebugConfiguration()];
    }
}

/**
 * NodeJsDebugSessionFactory symbol for DI.
 */
export const NodeJsDebugSessionFactory = Symbol('NodeJsDebugSessionFactory');

/**
 * NodeJs session factory.
 */
export interface NodeJsDebugSessionFactory extends DebugSessionFactory {
}

/**
 * NodeJsDebugSessionFactory implementation.
 */
@injectable()
export class NodeJsDebugSessionFactoryImpl implements NodeJsDebugSessionFactory {
    @inject(ILogger)
    protected readonly logger: ILogger;

    create(config: DebugConfiguration) {
        this.logger.info("NodeJs debug session created");
        return new NodeJsDebugSession();
    }
}

/**
 * Registers NodeJs [debug configuration provider](#NodeJsDebugConfigurationProvider)
 * and [session factory](#NodeJsDebugSessionFactory).
 */
@injectable()
export class NodeJsDebugRegistrator implements DebugConfigurationContribution, DebugSessionFactoryContribution {
    @inject(NodeJsDebugSessionFactory)
    protected readonly factory: NodeJsDebugSessionFactory;

    @inject(NodeJsDebugConfigurationProvider)
    protected readonly provider: NodeJsDebugConfigurationProvider;

    registerDebugSessionFactory(registry: DebugSessionFactoryRegistry) {
        registry.registerDebugSessionFactory(NODEJS, this.factory);
    }
    registerDebugConfigurationProvider(registry: DebugConfigurationProviderRegistry) {
        registry.registerDebugConfigurationProvider(NODEJS, this.provider);
    }
}

export class NodeJsDebugConfiguration implements DebugConfiguration {
    [key: string]: any;
    type: string;
    name: string;
}

/**
 *  NodeJs session implementation.
 */
export class NodeJsDebugSession implements DebugSession {
    initializeRequest(initializeRequest: DebugProtocol.InitializeRequest) {
        return new Debug.InitializeResponse();
    }

    dispose(): void {
    }
}
