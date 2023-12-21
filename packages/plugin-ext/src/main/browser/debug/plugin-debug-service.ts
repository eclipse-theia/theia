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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { DebuggerDescription, DebugPath, DebugService } from '@theia/debug/lib/common/debug-service';
import debounce = require('@theia/core/shared/lodash.debounce');
import { deepClone, Emitter, Event, nls } from '@theia/core';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { PluginDebugAdapterContribution } from './plugin-debug-adapter-contribution';
import { PluginDebugConfigurationProvider } from './plugin-debug-configuration-provider';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CommandIdVariables } from '@theia/variable-resolver/lib/common/variable-types';
import { DebugConfigurationProviderTriggerKind } from '../../../common/plugin-api-rpc';
import { DebuggerContribution } from '../../../common/plugin-protocol';
import { DebugRequestTypes } from '@theia/debug/lib/browser/debug-session-connection';
import * as theia from '@theia/plugin';

/**
 * Debug service to work with plugin and extension contributions.
 */
@injectable()
export class PluginDebugService implements DebugService {

    protected readonly onDidChangeDebuggersEmitter = new Emitter<void>();
    get onDidChangeDebuggers(): Event<void> {
        return this.onDidChangeDebuggersEmitter.event;
    }

    protected readonly debuggers: DebuggerContribution[] = [];
    protected readonly contributors = new Map<string, PluginDebugAdapterContribution>();
    protected readonly configurationProviders = new Map<number, PluginDebugConfigurationProvider>();
    protected readonly toDispose = new DisposableCollection(this.onDidChangeDebuggersEmitter);

    protected readonly onDidChangeDebugConfigurationProvidersEmitter = new Emitter<void>();
    get onDidChangeDebugConfigurationProviders(): Event<void> {
        return this.onDidChangeDebugConfigurationProvidersEmitter.event;
    }

    // maps session and contribution
    protected readonly sessionId2contrib = new Map<string, PluginDebugAdapterContribution>();
    protected delegated: DebugService;

    @inject(WebSocketConnectionProvider)
    protected readonly connectionProvider: WebSocketConnectionProvider;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.delegated = this.connectionProvider.createProxy<DebugService>(DebugPath);
        this.toDispose.pushAll([
            Disposable.create(() => this.delegated.dispose()),
            Disposable.create(() => {
                for (const sessionId of this.sessionId2contrib.keys()) {
                    const contrib = this.sessionId2contrib.get(sessionId)!;
                    contrib.terminateDebugSession(sessionId);
                }
                this.sessionId2contrib.clear();
            })]);
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

    // debouncing to send a single notification for multiple registrations at initialization time
    fireOnDidConfigurationProvidersChanged = debounce(() => {
        this.onDidChangeDebugConfigurationProvidersEmitter.fire();
    }, 100);

    registerDebugConfigurationProvider(provider: PluginDebugConfigurationProvider): Disposable {
        if (this.configurationProviders.has(provider.handle)) {
            const configuration = this.configurationProviders.get(provider.handle);
            if (configuration && configuration.type !== provider.type) {
                console.warn(`Different debug configuration provider with type '${configuration.type}' already registered.`);
                provider.handle = this.configurationProviders.size;
            }
        }
        const handle = provider.handle;
        this.configurationProviders.set(handle, provider);
        this.fireOnDidConfigurationProvidersChanged();
        return Disposable.create(() => this.unregisterDebugConfigurationProvider(handle));
    }

    unregisterDebugConfigurationProvider(handle: number): void {
        this.configurationProviders.delete(handle);
        this.fireOnDidConfigurationProvidersChanged();
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

    async fetchDynamicDebugConfiguration(name: string, providerType: string, folder?: string): Promise<DebugConfiguration | undefined> {
        const pluginProviders =
            Array.from(this.configurationProviders.values()).filter(p => (
                p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic &&
                p.type === providerType &&
                p.provideDebugConfigurations
            ));

        for (const provider of pluginProviders) {
            const configurations = await provider.provideDebugConfigurations(folder);
            for (const configuration of configurations) {
                if (configuration.name === name) {
                    return configuration;
                }
            }
        }
    }

    async provideDynamicDebugConfigurations(folder?: string): Promise<Record<string, DebugConfiguration[]>> {
        const pluginProviders =
            Array.from(this.configurationProviders.values()).filter(p => (
                p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic &&
                p.provideDebugConfigurations
            ));

        const configurationsRecord: Record<string, DebugConfiguration[]> = {};

        await Promise.all(pluginProviders.map(async provider => {
            const configurations = await provider.provideDebugConfigurations(folder);
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
                schemas = schemas.concat(this.resolveSchemaAttributes(contribution.type, contribution.configurationAttributes));
            }
        }
        return schemas;
    }

    protected resolveSchemaAttributes(type: string, configurationAttributes: { [request: string]: IJSONSchema }): IJSONSchema[] {
        const taskSchema = {};
        return Object.keys(configurationAttributes).map(request => {
            const attributes: IJSONSchema = deepClone(configurationAttributes[request]);
            const defaultRequired = ['name', 'type', 'request'];
            attributes.required = attributes.required && attributes.required.length ? defaultRequired.concat(attributes.required) : defaultRequired;
            attributes.additionalProperties = false;
            attributes.type = 'object';
            if (!attributes.properties) {
                attributes.properties = {};
            }
            const properties = attributes.properties;
            properties['type'] = {
                enum: [type],
                description: nls.localizeByDefault('Type of configuration.'),
                pattern: '^(?!node2)',
                errorMessage: nls.localizeByDefault('The debug type is not recognized. Make sure that you have a corresponding debug extension installed and that it is enabled.'),
                patternErrorMessage: nls.localizeByDefault('"node2" is no longer supported, use "node" instead and set the "protocol" attribute to "inspector".')
            };
            properties['name'] = {
                type: 'string',
                description: nls.localizeByDefault('Name of configuration; appears in the launch configuration dropdown menu.'),
                default: 'Launch'
            };
            properties['request'] = {
                enum: [request],
                description: nls.localizeByDefault('Request type of configuration. Can be "launch" or "attach".'),
            };
            properties['debugServer'] = {
                type: 'number',
                description: nls.localizeByDefault(
                    'For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode'
                ),
                default: 4711
            };
            properties['preLaunchTask'] = {
                anyOf: [taskSchema, {
                    type: ['string'],
                }],
                default: '',
                description: nls.localizeByDefault('Task to run before debug session starts.')
            };
            properties['postDebugTask'] = {
                anyOf: [taskSchema, {
                    type: ['string'],
                }],
                default: '',
                description: nls.localizeByDefault('Task to run after debug session ends.')
            };
            properties['internalConsoleOptions'] = {
                enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
                default: 'openOnFirstSessionStart',
                description: nls.localizeByDefault('Controls when the internal Debug Console should open.')
            };

            const osProperties = Object.assign({}, properties);
            properties['windows'] = {
                type: 'object',
                description: nls.localizeByDefault('Windows specific launch configuration attributes.'),
                properties: osProperties
            };
            properties['osx'] = {
                type: 'object',
                description: nls.localizeByDefault('OS X specific launch configuration attributes.'),
                properties: osProperties
            };
            properties['linux'] = {
                type: 'object',
                description: nls.localizeByDefault('Linux specific launch configuration attributes.'),
                properties: osProperties
            };
            Object.keys(attributes.properties).forEach(name => {
                // Use schema allOf property to get independent error reporting #21113
                attributes!.properties![name].pattern = attributes!.properties![name].pattern || '^(?!.*\\$\\{(env|config|command)\\.)';
                attributes!.properties![name].patternErrorMessage = attributes!.properties![name].patternErrorMessage ||
                    nls.localizeByDefault("'env.', 'config.' and 'command.' are deprecated, use 'env:', 'config:' and 'command:' instead.");
            });

            return attributes;
        });
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

    dispose(): void {
        this.toDispose.dispose();
    }
}
