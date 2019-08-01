/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * copied from
 * https://github.com/microsoft/vscode/blob/0a34756cae4fc67739e60c708b04637089f8bb0d/src/vs/workbench/services/configurationResolver/common/configurationResolverSchema.ts#L23
 */

const idDescription = "The input's id is used to associate an input with a variable of the form ${input:id}.";
const typeDescription = 'The type of user input prompt to use.';
const descriptionDescription = 'The description is shown when the user is prompted for input.';
const defaultDescription = 'The default value for the input.';

import { IJSONSchema } from '@theia/core/lib/common/json-schema';

export const inputsSchema: IJSONSchema = {
    definitions: {
        inputs: {
            type: 'array',
            description: 'User inputs. Used for defining user input prompts, such as free string input or a choice from several options.',
            items: {
                oneOf: [
                    {
                        type: 'object',
                        required: ['id', 'type', 'description'],
                        additionalProperties: false,
                        properties: {
                            id: {
                                type: 'string',
                                description: idDescription
                            },
                            type: {
                                type: 'string',
                                description: typeDescription,
                                enum: ['promptString'],
                                enumDescriptions: [
                                    "The 'promptString' type opens an input box to ask the user for input."
                                ]
                            },
                            description: {
                                type: 'string',
                                description: descriptionDescription
                            },
                            default: {
                                type: 'string',
                                description: defaultDescription
                            },
                        }
                    },
                    {
                        type: 'object',
                        required: ['id', 'type', 'description', 'options'],
                        additionalProperties: false,
                        properties: {
                            id: {
                                type: 'string',
                                description: idDescription
                            },
                            type: {
                                type: 'string',
                                description: typeDescription,
                                enum: ['pickString'],
                                enumDescriptions: [
                                    "The 'pickString' type shows a selection list.",
                                ]
                            },
                            description: {
                                type: 'string',
                                description: descriptionDescription
                            },
                            default: {
                                type: 'string',
                                description: defaultDescription
                            },
                            options: {
                                type: 'array',
                                description: 'An array of strings that defines the options for a quick pick.',
                                items: {
                                    type: 'string'
                                }
                            }
                        }
                    },
                    {
                        type: 'object',
                        required: ['id', 'type', 'command'],
                        additionalProperties: false,
                        properties: {
                            id: {
                                type: 'string',
                                description: idDescription
                            },
                            type: {
                                type: 'string',
                                description: typeDescription,
                                enum: ['command'],
                                enumDescriptions: [
                                    "The 'command' type executes a command.",
                                ]
                            },
                            command: {
                                type: 'string',
                                description: 'The command to execute for this input variable.'
                            },
                            args: {
                                type: 'object',
                                description: 'Optional arguments passed to the command.'
                            }
                        }
                    }
                ]
            }
        }
    }
};
