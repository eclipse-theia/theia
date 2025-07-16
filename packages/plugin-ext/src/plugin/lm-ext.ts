// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type * as theia from '@theia/plugin';
import { Disposable } from '@theia/core/lib/common/disposable';
import { RPCProtocol } from '../common/rpc-protocol';
import {
    McpServerDefinitionRegistryExt,
    McpServerDefinitionRegistryMain,
    McpServerDefinitionDto,
    isMcpHttpServerDefinitionDto,
} from '../common/lm-protocol';
import { PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { PluginPackageMcpServerDefinitionProviderContribution } from '../common';
import { PluginLogger } from './logger';
import { McpHttpServerDefinition, McpServerDefinition, URI } from './types-impl';

// Local interfaces that match the proposed MCP API
interface McpServerDefinitionProvider {
    readonly onDidChangeMcpServerDefinitions?: theia.Event<void>;
    provideMcpServerDefinitions(): theia.ProviderResult<McpServerDefinition[]>;
    resolveMcpServerDefinition?(server: McpServerDefinition): theia.ProviderResult<McpServerDefinition>;
}

export class LmExtImpl implements McpServerDefinitionRegistryExt {

    private proxy: McpServerDefinitionRegistryMain;
    private logger: PluginLogger;
    private readonly providers = new Map<number, McpServerDefinitionProvider>();
    private readonly providerChangeListeners = new Map<number, Disposable>();
    private handleCounter = 0;
    private announcedMCPProviders: string[] = [];

    constructor(protected readonly rpc: RPCProtocol) {
        this.proxy = this.rpc.getProxy(PLUGIN_RPC_CONTEXT.MCP_SERVER_DEFINITION_REGISTRY_MAIN);
        this.logger = new PluginLogger(this.rpc, 'lm');
    }

    registerMcpServerDefinitionProvider(id: string, provider: McpServerDefinitionProvider): theia.Disposable {
        if (this.announcedMCPProviders.indexOf(id) === -1) {
            this.logger.warn(`An unknown McpProvider tried to register, please check the package.json: ${id}`);
        }
        const handle = this.handleCounter++;
        this.providers.set(handle, provider);

        this.proxy.$registerMcpServerDefinitionProvider(handle, id);

        if (provider.onDidChangeMcpServerDefinitions) {
            const changeListener = provider.onDidChangeMcpServerDefinitions(() => {
                this.proxy.$onDidChangeMcpServerDefinitions(handle);
            });
            this.providerChangeListeners.set(handle, changeListener);
        }

        return Disposable.create(() => {
            this.providers.delete(handle);
            const changeListener = this.providerChangeListeners.get(handle);
            if (changeListener) {
                changeListener.dispose();
                this.providerChangeListeners.delete(handle);
            }
            this.proxy.$unregisterMcpServerDefinitionProvider(handle);
        });
    }

    async $provideServerDefinitions(handle: number): Promise<McpServerDefinitionDto[]> {
        const provider = this.providers.get(handle);
        if (!provider) {
            return [];
        }

        try {
            const definitions = await provider.provideMcpServerDefinitions();
            if (!definitions) {
                return [];
            }

            return definitions.map(def => this.convertToDto(def));
        } catch (error) {
            this.logger.error('Error providing MCP server definitions:', error);
            return [];
        }
    }

    async $resolveServerDefinition(handle: number, server: McpServerDefinitionDto): Promise<McpServerDefinitionDto | undefined> {
        const provider = this.providers.get(handle);
        if (!provider || !provider.resolveMcpServerDefinition) {
            return server;
        }

        try {
            const definition = this.convertFromDto(server);
            const resolved = await provider.resolveMcpServerDefinition(definition);
            return resolved ? this.convertToDto(resolved) : undefined;
        } catch (error) {
            this.logger.error('Error resolving MCP server definition:', error);
            return server;
        }
    }

    private convertToDto(definition: McpServerDefinition): McpServerDefinitionDto {
        if (isMcpHttpServerDefinition(definition)) {
            return {
                label: definition.label,
                headers: definition.headers,
                uri: definition.uri,
                version: definition.version
            };
        }
        return {
            command: definition.command,
            args: definition.args,
            cwd: definition.cwd,
            version: definition.version,
            label: definition.label,
            env: definition.env
        };
    }

    private convertFromDto(dto: McpServerDefinitionDto): McpServerDefinition {
        if (isMcpHttpServerDefinitionDto(dto)) {
            return {
                label: dto.label,
                headers: dto.headers,
                uri: URI.revive(dto.uri),
                version: dto.version
            };
        }
        return {
            command: dto.command,
            args: dto.args,
            cwd: URI.revive(dto.cwd),
            version: dto.version,
            label: dto.label,
            env: dto.env
        };
    }

    registerMcpContributions(mcpContributions: PluginPackageMcpServerDefinitionProviderContribution[]): void {
        this.announcedMCPProviders.push(...mcpContributions.map(contribution => contribution.id));
    }
}

const isMcpHttpServerDefinition = (definition: McpServerDefinition): definition is McpHttpServerDefinition => 'uri' in definition;

