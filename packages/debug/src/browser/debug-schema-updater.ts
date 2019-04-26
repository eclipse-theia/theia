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

import { injectable, inject } from 'inversify';
import { JsonSchemaStore } from '@theia/core/lib/browser/json-schema-store';
import { InMemoryResources, deepClone } from '@theia/core/lib/common';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import URI from '@theia/core/lib/common/uri';
import { DebugService } from '../common/debug-service';
import { debugPreferencesSchema } from './debug-preferences';

@injectable()
export class DebugSchemaUpdater {

    @inject(JsonSchemaStore) protected readonly jsonSchemaStore: JsonSchemaStore;
    @inject(InMemoryResources) protected readonly inmemoryResources: InMemoryResources;
    @inject(DebugService) protected readonly debug: DebugService;

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

        const uri = new URI(launchSchemaId);
        const contents = JSON.stringify(schema);
        try {
            this.inmemoryResources.update(uri, contents);
        } catch (e) {
            this.inmemoryResources.add(uri, contents);
            this.jsonSchemaStore.registerSchema({
                fileMatch: ['launch.json'],
                url: uri.toString()
            });
        }
    }
}

export const launchSchemaId = 'vscode://schemas/launch';
const launchSchema: IJSONSchema = {
    $id: launchSchemaId,
    type: 'object',
    title: 'Launch',
    required: [],
    default: { version: '0.2.0', configurations: [] },
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
        }
    }
};
