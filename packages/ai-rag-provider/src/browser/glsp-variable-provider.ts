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

import {
    AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver,
    AIVariableService, ResolvedAIVariable
} from '@theia/ai-core/lib/common/variable-service';
import { MaybePromise } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RagService } from '../common';
import { ChatVariableContext } from '@theia/ai-chat';

export const GLSP_VARIABLE: AIVariable = {
    id: 'glsp-provider',
    description: 'Retrieve documentation from web',
    name: 'glsp'
};

export interface ResolvedWebRagVariable extends ResolvedAIVariable {
}

@injectable()
export class GLSPVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(RagService)
    protected ragService: RagService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(GLSP_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name !== GLSP_VARIABLE.name) {
            return 0;
        }

        if (!request.arg) {
            console.error('Please provide the absolute path to a clone of the GLSP documentation repository');
            return 0;
        }

        return 2;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        return this.resolveGLSPVariable(request, context);
    }
    async resolveGLSPVariable(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedWebRagVariable> {

        // can we get the current prompt from the context?
        if (!ChatVariableContext.is(context)) {
            console.log('error : not a chat variable context');
        }

        const chatRequestText = (context as ChatVariableContext).request.text;

        // arg is checked in canResolve
        const allGLSPWebsiteFiles = await this.ragService.getAllFiles(request.arg!, []);
        for (const file of allGLSPWebsiteFiles) {
            if (file.includes('documentation') && file.endsWith('.md') && !file.endsWith('index.md')) {
                await this.ragService.loadFile(file);
            }
        }


        const modifiedRequest = chatRequestText.replace('#glsp', '').trim();

        const results = await this.ragService.queryPageContent(modifiedRequest, 3);
        console.log('variable has been resolved to:', results);

        const urls = [];
        for (const result of results) {
            if (result.metadata.filePath.endsWith('CHANGELOG.md')) {
                urls.push('https://github.com/eclipse-glsp/glsp-client/blob/master/CHANGELOG.md');
                continue;
            }
            const segmentAfterDocumentation = result.metadata.filePath.split('documentation/')[1].split('/')[0];
            const url = `https://eclipse.dev/glsp/documentation/${segmentAfterDocumentation}/`;
            urls.push(url);
        }

        const combinedResult = `
These urls are of interest for you:

-${urls.join('\n-')}

This is relevant content from the documentation:

-${results.map(r => r.content).join('\n')}
`;
        return ({
            variable: request.variable,
            value: combinedResult
        });
    }
}
