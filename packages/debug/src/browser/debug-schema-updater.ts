// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { JsonSchemaRegisterContext, JsonSchemaContribution } from '@theia/core/lib/browser/json-schema-store';
import { InMemoryResources, deepClone, nls } from '@theia/core/lib/common';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import URI from '@theia/core/lib/common/uri';
import { DebugService } from '../common/debug-service';
import { debugPreferencesSchema } from './debug-preferences';
import { inputsSchema } from '@theia/variable-resolver/lib/browser/variable-input-schema';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { defaultCompound } from '../common/debug-compound';

@injectable()
export class DebugSchemaUpdater implements JsonSchemaContribution {

    protected readonly uri = new URI(launchSchemaId);

    @inject(InMemoryResources) protected readonly inmemoryResources: InMemoryResources;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(DebugService) protected readonly debug: DebugService;

    @postConstruct()
    protected init(): void {
        this.inmemoryResources.add(this.uri, '');
    }

    registerSchemas(context: JsonSchemaRegisterContext): void {
        context.registerSchema({
            fileMatch: ['launch.json'],
            url: this.uri.toString()
        });
        this.workspaceService.updateSchema('launch', { $ref: this.uri.toString() });
    }

    async update(): Promise<void> {
        const types = await this.debug.debugTypes();
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

        const contents = JSON.stringify(schema);
        this.inmemoryResources.update(this.uri, contents);
    }
}

export const launchSchemaId = 'vscode://schemas/launch';
const launchSchema: IJSONSchema = {
    $id: launchSchemaId,
    type: 'object',
    title: nls.localizeByDefault('Launch'),
    required: [],
    default: { version: '0.2.0', configurations: [], compounds: [] },
    properties: {
        version: {
            type: 'string',
            description: nls.localizeByDefault('Version of this file format.'),
            default: '0.2.0'
        },
        configurations: {
            type: 'array',
            description: nls.localizeByDefault('List of configurations. Add new configurations or edit existing ones by using IntelliSense.'),
            items: {
                defaultSnippets: [],
                'type': 'object',
                oneOf: []
            }
        },
        compounds: {
            type: 'array',
            description: nls.localizeByDefault('List of compounds. Each compound references multiple configurations which will get launched together.'),
            items: {
                type: 'object',
                required: ['name', 'configurations'],
                properties: {
                    name: {
                        type: 'string',
                        description: nls.localizeByDefault('Name of compound. Appears in the launch configuration drop down menu.')
                    },
                    configurations: {
                        type: 'array',
                        default: [],
                        items: {
                            oneOf: [{
                                type: 'string',
                                description: nls.localizeByDefault('Please use unique configuration names.')
                            }, {
                                type: 'object',
                                required: ['name'],
                                properties: {
                                    name: {
                                        enum: [],
                                        description: nls.localizeByDefault('Name of compound. Appears in the launch configuration drop down menu.')
                                    },
                                    folder: {
                                        enum: [],
                                        description: nls.localizeByDefault('Name of folder in which the compound is located.')
                                    }
                                }
                            }]
                        },
                        description: nls.localizeByDefault('Names of configurations that will be started as part of this compound.')
                    },
                    stopAll: {
                        type: 'boolean',
                        default: false,
                        description: nls.localizeByDefault('Controls whether manually terminating one session will stop all of the compound sessions.')
                    },
                    preLaunchTask: {
                        type: 'string',
                        default: '',
                        description: nls.localizeByDefault('Task to run before any of the compound configurations start.')
                    }
                },
                default: defaultCompound
            },
            default: [defaultCompound]
        },
        inputs: inputsSchema.definitions!.inputs
    },
    allowComments: true,
    allowTrailingCommas: true,
};
