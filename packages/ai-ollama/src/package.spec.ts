// *****************************************************************************
// Copyright (C) 2025 TypeFox GmbH and others.
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

import { ToolRequest } from '@theia/ai-core';
import { OllamaModel } from './node/ollama-language-model';
import { Tool } from 'ollama';
import { expect } from 'chai';
import * as sinon from 'sinon';

describe('ai-ollama package', () => {

    it('Transform to Ollama tools', () => {
        const req: ToolRequest = createToolRequest();
        const model = new OllamaModelUnderTest();
        const ollamaTool = model.toOllamaTool(req);

        expect(ollamaTool.function.name).equals('example-tool');
        expect(ollamaTool.function.description).equals('Example Tool');
        expect(ollamaTool.function.parameters?.type).equal('object');
        expect(ollamaTool.function.parameters?.properties).to.deep.equal(req.parameters.properties);
        expect(ollamaTool.function.parameters?.required).to.deep.equal(['question']);
    });
});

class OllamaModelUnderTest extends OllamaModel {
    constructor() {
        super('id', 'model', () => '');
    }

    override toOllamaTool(tool: ToolRequest): Tool & { handler: (arg_string: string) => Promise<unknown> } {
        return super.toOllamaTool(tool);
    }
}
function createToolRequest(): ToolRequest {
    return {
        id: 'tool-1',
        name: 'example-tool',
        description: 'Example Tool',
        parameters: {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'What is the best pizza topping?'
                },
                optional: {
                    type: 'string',
                    description: 'Optional parameter'
                }
            },
            required: ['question']
        },
        handler: sinon.stub()
    };
}
