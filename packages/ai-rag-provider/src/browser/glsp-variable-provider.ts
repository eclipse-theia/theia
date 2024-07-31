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
import { injectable } from '@theia/core/shared/inversify';

export const GLSP_VARIABLE: AIVariable = {
    id: 'glsp-documentation-provider',
    description: 'Retrieve documentation for GSLP',
    name: 'glspdoc'
};

export interface ResolvedGLSPVariable extends ResolvedAIVariable {
    documentation: string;
}
@injectable()
export class GLSPVariableContribution implements AIVariableContribution, AIVariableResolver {

    registerVariables(service: AIVariableService): void {
        service.registerResolver(GLSP_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === GLSP_VARIABLE.name ? 2 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        return this.resolveGLSPVariable(request, context);
    }
    resolveGLSPVariable(request: AIVariableResolutionRequest, context: AIVariableContext): ResolvedGLSPVariable {
        const text = 'This is a dummy documentation file';
        console.log(`variable has been resolved to: ${text}`);
        return {
            variable: request.variable,
            documentation: text,
            value: text
        };
    }
}
