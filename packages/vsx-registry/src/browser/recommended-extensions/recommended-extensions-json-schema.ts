// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { InMemoryResources } from '@theia/core';
import { JsonSchemaContribution, JsonSchemaRegisterContext } from '@theia/core/lib/browser/json-schema-store';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';

export const extensionsSchemaID = 'vscode://schemas/extensions';
export const extensionsConfigurationSchema: IJSONSchema = {
    $id: extensionsSchemaID,
    default: { recommendations: [] },
    type: 'object',

    properties: {
        recommendations: {
            title: 'A list of extensions recommended for users of this workspace. Should use the form "<publisher>.<extension name>"',
            type: 'array',
            items: {
                type: 'string',
                pattern: '^\\w[\\w-]+\\.\\w[\\w-]+$',
                patternErrorMessage: "Expected format '${publisher}.${name}'. Example: 'eclipse.theia'."
            },
            default: [],
        },
        unwantedRecommendations: {
            title: 'A list of extensions recommended by default that should not be recommended to users of this workspace. Should use the form "<publisher>.<extension name>"',
            type: 'array',
            items: {
                type: 'string',
                pattern: '^\\w[\\w-]+\\.\\w[\\w-]+$',
                patternErrorMessage: "Expected format '${publisher}.${name}'. Example: 'eclipse.theia'."
            },
            default: [],
        }
    },
    allowComments: true,
    allowTrailingCommas: true,
};

@injectable()
export class ExtensionSchemaContribution implements JsonSchemaContribution {
    protected readonly uri = new URI(extensionsSchemaID);
    @inject(InMemoryResources) protected readonly inmemoryResources: InMemoryResources;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.inmemoryResources.add(this.uri, JSON.stringify(extensionsConfigurationSchema));
    }

    registerSchemas(context: JsonSchemaRegisterContext): void {
        context.registerSchema({
            fileMatch: ['extensions.json'],
            url: this.uri.toString(),
        });
        this.workspaceService.updateSchema('extensions', { $ref: this.uri.toString() });
    }
}
