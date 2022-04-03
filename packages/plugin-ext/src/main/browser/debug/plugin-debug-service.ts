// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { DebuggerDescription, DebugPath, DebugService } from '@theia/debug/lib/common/debug-service';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { PluginDebugAdapterContribution } from './plugin-debug-adapter-contribution';
import { PluginDebugConfigurationProvider } from './plugin-debug-configuration-provider';
import { injectable, inject, postConstruct, named } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CommandIdVariables } from '@theia/variable-resolver/lib/common/variable-types';
import { DebugConfigurationProviderTriggerKind } from '../../../common/plugin-api-rpc';
import { DebuggerContribution } from '../../../common/plugin-protocol';
import { DebugRequestTypes } from '@theia/debug/lib/browser/debug-session-connection';
import * as theia from '@theia/plugin';
import { BackendAndFrontend, ProxyProvider } from '@theia/core';

/**
 * Debug service to work with plugin and extension contributions.
 */
@injectable()
export class PluginDebugService implements DebugService {

    protected readonly debuggers: DebuggerContribution[] = [];
    protected readonly contributors = new Map<string, PluginDebugAdapterContribution>();
    protected readonly configurationProviders = new Map<number, PluginDebugConfigurationProvider>();
    protected readonly toDispose = new DisposableCollection();

    // maps session and contribution
    protected readonly sessionId2contrib = new Map<string, PluginDebugAdapterContribution>();
    protected delegated: DebugService;

    @inject(ProxyProvider) @named(BackendAndFrontend)
    protected readonly proxyProvider: ProxyProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        // Paul Maréchal: We should not get a proxy this way,
        // this is both an anti-pattern and a code smell...
        this.delegated = this.proxyProvider.getProxy<DebugService>(DebugPath);
    }

    registerDebugAdapterContribution(contrib: PluginDebugAdapterContribution): Disposable {
        const { type } = contrib;

        if (this.contributors.has(type)) {
            console.warn(`Debugger with type '${type}' already registered.`);
            return Disposable.NULL;
        }

        this.contributors.set(type, contrib);
        return Disposable.create(() => this.unregisterDebugAdapterContribution(type));
    }

    unregisterDebugAdapterContribution(debugType: string): void {
        this.contributors.delete(debugType);
    }

    registerDebugConfigurationProvider(provider: PluginDebugConfigurationProvider): Disposable {
        const handle = provider.handle;
        this.configurationProviders.set(handle, provider);
        return Disposable.create(() => this.unregisterDebugConfigurationProvider(handle));
    }

    unregisterDebugConfigurationProvider(handle: number): void {
        this.configurationProviders.delete(handle);
    }

    async debugTypes(): Promise<string[]> {
        const debugTypes = new Set(await this.delegated.debugTypes());
        for (const contribution of this.debuggers) {
            debugTypes.add(contribution.type);
        }
        for (const debugType of this.contributors.keys()) {
            debugTypes.add(debugType);
        }
        return [...debugTypes];
    }

    async provideDebugConfigurations(debugType: keyof DebugRequestTypes, workspaceFolderUri: string | undefined): Promise<theia.DebugConfiguration[]> {
        const pluginProviders =
            Array.from(this.configurationProviders.values()).filter(p => (
                p.triggerKind === DebugConfigurationProviderTriggerKind.Initial &&
                (p.type === debugType || p.type === '*') &&
                p.provideDebugConfigurations
            ));

        if (pluginProviders.length === 0) {
            return this.delegated.provideDebugConfigurations(debugType, workspaceFolderUri);
        }

        const results: DebugConfiguration[] = [];
        await Promise.all(pluginProviders.map(async p => {
            const result = await p.provideDebugConfigurations(workspaceFolderUri);
            if (result) {
                results.push(...result);
            }
        }));

        return results;
    }

    async provideDynamicDebugConfigurations(): Promise<Record<string, DebugConfiguration[]>> {
        const pluginProviders =
            Array.from(this.configurationProviders.values()).filter(p => (
                p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic &&
                p.provideDebugConfigurations
            ));

        const configurationsRecord: Record<string, DebugConfiguration[]> = {};

        await Promise.all(pluginProviders.map(async provider => {
            const configurations = await provider.provideDebugConfigurations(undefined);
            for (const configuration of configurations) {
                configuration.dynamic = true;
            }
            let configurationsPerType = configurationsRecord[provider.type];
            configurationsPerType = configurationsPerType ? configurationsPerType.concat(configurations) : configurations;

            if (configurationsPerType.length > 0) {
                configurationsRecord[provider.type] = configurationsPerType;
            }
        }));

        return configurationsRecord;
    }

    async resolveDebugConfiguration(
        config: DebugConfiguration,
        workspaceFolderUri: string | undefined
    ): Promise<DebugConfiguration | undefined | null> {
        const allProviders = Array.from(this.configurationProviders.values());

        const resolvers = allProviders
            .filter(p => p.type === config.type && !!p.resolveDebugConfiguration)
            .map(p => p.resolveDebugConfiguration);

        // Append debug type '*' at the end
        resolvers.push(
            ...allProviders
                .filter(p => p.type === '*' && !!p.resolveDebugConfiguration)
                .map(p => p.resolveDebugConfiguration)
        );

        const resolved = await this.resolveDebugConfigurationByResolversChain(config, workspaceFolderUri, resolvers);

        return resolved ? this.delegated.resolveDebugConfiguration(resolved, workspaceFolderUri) : resolved;
    }

    async resolveDebugConfigurationWithSubstitutedVariables(
        config: DebugConfiguration,
        workspaceFolderUri: string | undefined
    ): Promise<DebugConfiguration | undefined | null> {
        const allProviders = Array.from(this.configurationProviders.values());

        const resolvers = allProviders
            .filter(p => p.type === config.type && !!p.resolveDebugConfigurationWithSubstitutedVariables)
            .map(p => p.resolveDebugConfigurationWithSubstitutedVariables);

        // Append debug type '*' at the end
        resolvers.push(
            ...allProviders
                .filter(p => p.type === '*' && !!p.resolveDebugConfigurationWithSubstitutedVariables)
                .map(p => p.resolveDebugConfigurationWithSubstitutedVariables)
        );

        const resolved = await this.resolveDebugConfigurationByResolversChain(config, workspaceFolderUri, resolvers);

        return resolved
            ? this.delegated.resolveDebugConfigurationWithSubstitutedVariables(resolved, workspaceFolderUri)
            : resolved;
    }

    protected async resolveDebugConfigurationByResolversChain(
        config: DebugConfiguration,
        workspaceFolderUri: string | undefined,
        resolvers: ((
            folder: string | undefined,
            debugConfiguration: DebugConfiguration
        ) => Promise<DebugConfiguration | null | undefined>)[]
    ): Promise<DebugConfiguration | undefined | null> {
        let resolved: DebugConfiguration | undefined | null = config;
        for (const resolver of resolvers) {
            try {
                if (!resolved) {
                    // A provider has indicated to stop and process undefined or null as per specified in the vscode API
                    // https://code.visualstudio.com/api/references/vscode-api#DebugConfigurationProvider
                    break;
                }
                resolved = await resolver(workspaceFolderUri, resolved);
            } catch (e) {
                console.error(e);
            }
        }
        return resolved;
    }

    registerDebugger(contribution: DebuggerContribution): Disposable {
        this.debuggers.push(contribution);
        return Disposable.create(() => {
            const index = this.debuggers.indexOf(contribution);
            if (index !== -1) {
                this.debuggers.splice(index, 1);
            }
        });
    }

    async provideDebuggerVariables(debugType: string): Promise<CommandIdVariables> {
        for (const contribution of this.debuggers) {
            if (contribution.type === debugType) {
                const variables = contribution.variables;
                if (variables && Object.keys(variables).length > 0) {
                    return variables;
                }
            }
        }
        return {};
    }

    async getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]> {
        const debuggers = await this.delegated.getDebuggersForLanguage(language);

        for (const contributor of this.debuggers) {
            const languages = contributor.languages;
            if (languages && languages.indexOf(language) !== -1) {
                const { label, type } = contributor;
                debuggers.push({ type, label: label || type });
            }
        }

        return debuggers;
    }

    async getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        let schemas = await this.delegated.getSchemaAttributes(debugType);
        for (const contribution of this.debuggers) {
            if (contribution.configurationAttributes &&
                (contribution.type === debugType || contribution.type === '*' || debugType === '*')) {
                schemas = schemas.concat(contribution.configurationAttributes);
            }
        }
        return schemas;
    }

    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        let snippets = await this.delegated.getConfigurationSnippets();

        for (const contribution of this.debuggers) {
            if (contribution.configurationSnippets) {
                snippets = snippets.concat(contribution.configurationSnippets);
            }
        }

        return snippets;
    }

    async createDebugSession(config: DebugConfiguration, workspaceFolder: string | undefined): Promise<string> {
        const contributor = this.contributors.get(config.type);
        if (contributor) {
            const sessionId = await contributor.createDebugSession(config, workspaceFolder);
            this.sessionId2contrib.set(sessionId, contributor);
            return sessionId;
        } else {
            return this.delegated.createDebugSession(config, workspaceFolder);
        }
    }

    async terminateDebugSession(sessionId: string): Promise<void> {
        const contributor = this.sessionId2contrib.get(sessionId);
        if (contributor) {
            this.sessionId2contrib.delete(sessionId);
            return contributor.terminateDebugSession(sessionId);
        } else {
            return this.delegated.terminateDebugSession(sessionId);
        }
    }
}
