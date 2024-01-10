// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { nls, CommandRegistry, InMemoryResources, deepClone } from '@theia/core/lib/common';
import { JsonSchemaContribution, JsonSchemaRegisterContext } from '@theia/core/lib/browser/json-schema-store';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class KeybindingSchemaUpdater implements JsonSchemaContribution {
    protected readonly uri = new URI(keybindingSchemaId);
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(InMemoryResources) protected readonly inMemoryResources: InMemoryResources;

    @postConstruct()
    protected init(): void {
        this.inMemoryResources.add(new URI(keybindingSchemaId), '');
        this.updateSchema();
        this.commandRegistry.onCommandsChanged(() => this.updateSchema());
    }

    registerSchemas(store: JsonSchemaRegisterContext): void {
        store.registerSchema({
            fileMatch: ['keybindings.json', 'keymaps.json'],
            url: this.uri.toString(),
        });
    }

    protected updateSchema(): void {
        const schema = deepClone(keybindingSchema);
        const enumValues = schema.items.allOf[0].properties!.command.anyOf[1].enum!;
        const enumDescriptions = schema.items.allOf[0].properties!.command.anyOf[1].enumDescriptions!;
        for (const command of this.commandRegistry.getAllCommands()) {
            if (command.handlers.length > 0 && !command.id.startsWith('_')) {
                enumValues.push(command.id);
                enumDescriptions.push(command.label ?? '');
            }
        }
        this.inMemoryResources.update(this.uri, JSON.stringify(schema));
    }
}

const keybindingSchemaId = 'vscode://schemas/keybindings';
export const keybindingSchema = {
    $id: keybindingSchemaId,
    type: 'array',
    title: 'Keybinding Configuration File',
    default: [],
    definitions: {
        key: { type: 'string', description: nls.localizeByDefault('Key or key sequence (separated by space)') },
    },
    items: {
        type: 'object',
        defaultSnippets: [{ body: { key: '$1', command: '$2', when: '$3' } }],
        allOf: [
            {
                required: ['command'],
                properties: {
                    command: {
                        anyOf: [{ type: 'string' }, { enum: <string[]>[], enumDescriptions: <string[]>[] }], description: nls.localizeByDefault('Name of the command to execute')
                    },
                    when: { type: 'string', description: nls.localizeByDefault('Condition when the key is active.') },
                    args: { description: nls.localizeByDefault('Arguments to pass to the command to execute.') },
                    context: {
                        type: 'string',
                        description: nls.localizeByDefault('Condition when the key is active.'),
                        deprecationMessage: nls.localize('theia/keybinding-schema-updater/deprecation', 'Use `when` clause instead.')
                    }
                }
            },
            {
                anyOf: [
                    { required: ['key'], properties: { key: { $ref: '#/definitions/key' }, } },
                    { required: ['keybinding'], properties: { keybinding: { $ref: '#/definitions/key' } } }
                ]
            }
        ]
    },
    allowComments: true,
    allowTrailingCommas: true,
};

