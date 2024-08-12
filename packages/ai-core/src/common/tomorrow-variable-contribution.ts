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
import { MaybePromise } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver, AIVariableService, ResolvedAIVariable } from './variable-service';

export namespace TomorrowVariableArgs {
    export const IN_UNIX_SECONDS = 'inUnixSeconds';
    export const IN_ISO_8601 = 'inIso8601';
}

export const TOMORROW_VARIABLE: AIVariable = {
    id: 'tomorrow-provider',
    description: 'Does something for tomorrow',
    name: 'tomorrow',
    args: [
        { name: TomorrowVariableArgs.IN_ISO_8601, description: 'Returns the current date in ISO 8601 format' },
        { name: TomorrowVariableArgs.IN_UNIX_SECONDS, description: 'Returns the current date in unix seconds format' }
    ]
};

export interface ResolvedTomorrowVariable extends ResolvedAIVariable {
    date: Date;
}

@injectable()
export class TomorrowVariableContribution implements AIVariableContribution, AIVariableResolver {
    registerVariables(service: AIVariableService): void {
        service.registerResolver(TOMORROW_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return 1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name === TOMORROW_VARIABLE.name) {
            return this.resolveTomorrowVariable(request);
        }
        return undefined;
    }

    private resolveTomorrowVariable(request: AIVariableResolutionRequest): ResolvedTomorrowVariable {
        const date = new Date(+new Date() + 86400000);
        if (request.arg === TomorrowVariableArgs.IN_ISO_8601) {
            return { variable: request.variable, value: date.toISOString(), date };
        }
        if (request.arg === TomorrowVariableArgs.IN_UNIX_SECONDS) {
            return { variable: request.variable, value: Math.round(date.getTime() / 1000).toString(), date };
        }
        return { variable: request.variable, value: date.toDateString(), date };
    }
}
