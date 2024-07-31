// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { LanguageModelRequirement, PromptTemplate } from '@theia/ai-core';
import { ILogger, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ChatRequestModelImpl, CodeChatResponseContentImpl, Location } from './chat-model';

const CODE_SNIPPET: string = `
/**
 * Calculates the factorial of a given number.
 * @param n - The number to calculate the factorial for.
 * @returns The factorial of the number.
 */
function factorial(n: number): number {
    // Base case: if n is 0 or 1, return 1
    if (n === 0 || n === 1) {
        return 1;
    }

    // Recursive case: n * factorial of (n - 1)
    return n * factorial(n - 1);
}
`;

const CODE_SNIPPET_LANGUAGE = 'typescript';

@injectable()
export class MockCodeChatAgent implements ChatAgent {

    @inject(ILogger)
    protected logger: ILogger;

    defaultImplicitVariables?: string[] | undefined;
    id: string = 'MockCodeChatAgent';
    name: string = 'MockCodeChatAgent';
    iconClass = 'codicon codicon-file-code';
    description: string = 'Mock agent to test code response parts Theia.';
    variables: string[] = [];
    promptTemplates: PromptTemplate[] = [];
    languageModelRequirements: LanguageModelRequirement[] = [];
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;

    async invoke(request: ChatRequestModelImpl): Promise<void> {
        const dummyLocation: Location = {
            // FIXME Add real uri for testing
            uri: new URI('/home/user/workspace/test/myfile.ts'),
            position: {
                line: 2,
                character: 5
            }
        };

        request.response.response.addContent(new CodeChatResponseContentImpl(CODE_SNIPPET, CODE_SNIPPET_LANGUAGE, dummyLocation));
        request.response.complete();
    }

}
