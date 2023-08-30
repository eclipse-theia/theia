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

import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import * as Ajv from '@theia/core/shared/ajv';
import { DeflatedToolbarTree } from './toolbar-interfaces';

const toolbarColumnGroup: IJSONSchema = {
    'type': 'array',
    'description': 'Array of subgroups for right toolbar column',
    'items': {
        'type': 'array',
        'description': 'Grouping',
        'items': {
            'type': 'object',
            'properties': {
                'id': { 'type': 'string' },
                'command': { 'type': 'string' },
                'icon': { 'type': 'string' },
                'tooltip': { 'type': 'string' },
                'group': { 'enum': ['contributed'] },
                'when': { 'type': 'string' },
            },
            'required': [
                'id',
            ],
            'additionalProperties': false,
        }
    }
};

export const toolbarSchemaId = 'vscode://schemas/toolbar';
export const toolbarConfigurationSchema: IJSONSchema = {
    // '$schema': 'https://json-schema.org/draft/2019-09/schema',
    '$id': 'vscode://schemas/indexing-grid',
    'type': 'object',
    'title': 'Toolbar',
    'properties': {
        'items': {
            'type': 'object',
            'properties': {
                'left': toolbarColumnGroup,
                'center': toolbarColumnGroup,
                'right': toolbarColumnGroup,
            },
            'required': [
                'left',
                'center',
                'right'
            ],
            'additionalProperties': false,
        }
    },
    'required': [
        'items'
    ]
};

const validator = new Ajv().compile(toolbarConfigurationSchema);
export function isToolbarPreferences(candidate: unknown): candidate is DeflatedToolbarTree {
    return Boolean(validator(candidate));
}
