/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from 'inversify';
import { JsonSchemaStore } from '@theia/core/lib/browser/json-schema-store';
import { InMemoryResources, deepClone } from '@theia/core/lib/common';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import URI from '@theia/core/lib/common/uri';
import { DebugService } from '../common/debug-service';
import { debugPreferencesSchema } from './debug-preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { LaunchPreferenceProvider, LaunchProviderProvider } from './abstract-launch-preference-provider';
import { PreferenceSchema, PreferenceSchemaProvider, PreferenceScope } from '@theia/core/lib/browser';

@injectable()
export class DebugSchemaUpdater {

    @inject(JsonSchemaStore) protected readonly jsonSchemaStore: JsonSchemaStore;
    @inject(InMemoryResources) protected readonly inmemoryResources: InMemoryResources;
    @inject(DebugService) protected readonly debug: DebugService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(PreferenceSchemaProvider) protected readonly preferenceSchemaProvider: PreferenceSchemaProvider;
    @inject(LaunchProviderProvider) protected readonly launchProviderProvider: LaunchProviderProvider;

    private launchProviders: LaunchPreferenceProvider[] = [];

    private debugLaunchSchemaId = 'vscode://debug/launch.json';

    private schemaIsSet = false;

    @postConstruct()
    protected init(): void {
        this.initializeLaunchProviders();
    }

    protected initializeLaunchProviders(): void {
        PreferenceScope.getScopes().forEach(scope => {
            if (scope === PreferenceScope.Default) {
                return;
            }
            const provider = this.launchProviderProvider(scope);
            this.launchProviders.push(provider);
        });
        this.launchProviders.map(p =>
            p.onDidLaunchChanged(() => {
                this.updateDebugLaunchSchema();
            })
        );
    }

    protected async updateDebugLaunchSchema(): Promise<void> {
        const schema = await this.update();
        this.setDebugLaunchSchema(schema);
    }

    protected setDebugLaunchSchema(remoteSchema: IJSONSchema) {
        if (this.schemaIsSet) {
            this.preferenceSchemaProvider.setRemoteSchema(remoteSchema);
            return;
        }

        this.schemaIsSet = true;

        const debugLaunchPreferencesSchema: PreferenceSchema = {
            type: 'object',
            scope: 'resource',
            properties: {
                'launch': {
                    type: 'object',
                    description: "Global debug launch configuration. Should be used as an alternative to 'launch.json' that is shared across workspaces",
                    default: { configurations: [], compounds: [] },
                    $ref: launchSchemaId
                }
            }
        };
        this.preferenceSchemaProvider.setSchema(debugLaunchPreferencesSchema, remoteSchema);
    }

    async update(): Promise<IJSONSchema> {
        const types = await this.debug.debugTypes();
        const launchSchemaUrl = new URI(this.debugLaunchSchemaId);
        const schema = { ...deepClone(launchSchema) };
        const items = (<IJSONSchema>schema!.properties!['configurations'].items);

        const attributePromises = types.map(type => this.debug.getSchemaAttributes(type));
        for (const attributes of await Promise.all(attributePromises)) {
            for (const attribute of attributes) {
                const properties: typeof attribute['properties'] = {};
                for (const key of ['debugViewLocation', 'openDebug', 'internalConsoleOptions']) {
                    properties[key] = debugPreferencesSchema.properties[`debug.${key}`];
                }
                attribute.properties = Object.assign(properties, attribute.properties);
                items.oneOf!.push(attribute);
            }
        }
        items.defaultSnippets!.push(...await this.debug.getConfigurationSnippets());

        await Promise.all(this.launchProviders.map(l => l.ready));

        const compoundConfigurationSchema = (schema.properties!.compounds.items as IJSONSchema).properties!.configurations;
        const launchNames = this.launchProviders
            .map(launch => launch.getConfigurationNames(false))
            .reduce((allNames: string[], names: string[]) => {
                names.forEach(name => {
                    if (allNames.indexOf(name) === -1) {
                        allNames.push(name);
                    }
                });
                return allNames;
            }, []);
        (compoundConfigurationSchema.items as IJSONSchema).oneOf![0].enum = launchNames;
        (compoundConfigurationSchema.items as IJSONSchema).oneOf![1].properties!.name.enum = launchNames;

        const roots = await this.workspaceService.roots;
        const folderNames = roots.map(root => root.uri);
        (compoundConfigurationSchema.items as IJSONSchema).oneOf![1].properties!.folder.enum = folderNames;

        const contents = JSON.stringify(schema);
        try {
            await this.inmemoryResources.update(launchSchemaUrl, contents);
        } catch (e) {
            this.inmemoryResources.add(launchSchemaUrl, contents);
            this.jsonSchemaStore.registerSchema({
                fileMatch: ['launch.json'],
                url: launchSchemaUrl.toString()
            });
        }

        return schema;
    }
}

// debug general schema
export const defaultCompound = { name: 'Compound', configurations: [] };

export const launchSchemaId = 'vscode://schemas/launch';
export const launchSchema: IJSONSchema = {
    $id: launchSchemaId,
    type: 'object',
    title: 'Launch',
    required: [],
    default: { version: '0.2.0', configurations: [], compounds: [] },
    properties: {
        version: {
            type: 'string',
            description: 'Version of this file format.',
            default: '0.2.0'
        },
        configurations: {
            type: 'array',
            description: 'List of configurations. Add new configurations or edit existing ones by using IntelliSense.',
            items: {
                defaultSnippets: [],
                'type': 'object',
                oneOf: []
            }
        },
        compounds: {
            type: 'array',
            description: 'List of compounds. Each compound references multiple configurations which will get launched together.',
            items: {
                type: 'object',
                required: ['name', 'configurations'],
                properties: {
                    name: {
                        type: 'string',
                        description: 'Name of compound. Appears in the launch configuration drop down menu.'
                    },
                    configurations: {
                        type: 'array',
                        default: [],
                        items: {
                            oneOf: [{
                                enum: [],
                                description: 'Please use unique configuration names.'
                            }, {
                                type: 'object',
                                required: ['name'],
                                properties: {
                                    name: {
                                        enum: [],
                                        description: 'Name of compound. Appears in the launch configuration drop down menu.'
                                    },
                                    folder: {
                                        enum: [],
                                        description: 'Name of folder in which the compound is located.'
                                    }
                                }
                            }]
                        },
                        description: 'Names of configurations that will be started as part of this compound.'
                    }
                },
                default: defaultCompound
            },
            default: [
                defaultCompound
            ]
        }
    }
};
