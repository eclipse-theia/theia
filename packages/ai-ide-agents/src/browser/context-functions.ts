// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { MutableChatRequestModel } from '@theia/ai-chat';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class ListChatContext implements ToolProvider {
    static ID = 'context_ListChatContext';

    getTool(): ToolRequest {
        return {
            id: ListChatContext.ID,
            name: ListChatContext.ID,
            description: 'Returns the list of context elements (such as files) specified by the user manually as part of the chat request.',
            handler: async (_: string, ctx: MutableChatRequestModel): Promise<string> => {
                const result = ctx.context.variables.map(contextElement => ({
                    id: contextElement.variable.id + contextElement.arg,
                    type: contextElement.variable.name
                }));
                return JSON.stringify(result, undefined, 2);
            }
        };
    }
}

@injectable()
export class ResolveChatContext implements ToolProvider {
    static ID = 'context_ResolveChatContext';

    getTool(): ToolRequest {
        return {
            id: ResolveChatContext.ID,
            name: ResolveChatContext.ID,
            description: 'Returns the content of a specific context element (such as files) specified by the user manually as part of the chat request.',
            parameters: {
                type: 'object',
                properties: {
                    contextElementId: {
                        type: 'string',
                        description: 'The id of the context element to resolve.'
                    }
                },
                required: ['contextElementId']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                const { contextElementId } = JSON.parse(args) as { contextElementId: string };
                const variable = ctx.context.variables.find(contextElement => contextElement.variable.id + contextElement.arg === contextElementId);
                if (variable) {
                    const result = {
                        id: variable.variable.id + variable.arg,
                        type: variable.variable.name,
                        description: variable.variable.description,
                        value: variable.value,
                        content: variable.contextValue
                    };
                    return JSON.stringify(result, undefined, 2);
                }
                return JSON.stringify({ error: 'Context element not found' }, undefined, 2);
            }
        };
    }
}

