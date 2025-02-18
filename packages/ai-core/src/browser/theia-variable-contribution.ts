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
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { VariableRegistry, VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { AIVariableContribution, AIVariableResolver, AIVariableService, AIVariableResolutionRequest, AIVariableContext, ResolvedAIVariable } from '../common';

/**
 * Integrates the Theia VariableRegistry with the Theia AI VariableService
 */
@injectable()
export class TheiaVariableContribution implements AIVariableContribution, AIVariableResolver {
    @inject(VariableResolverService)
    protected readonly variableResolverService: VariableResolverService;

    @inject(VariableRegistry)
    protected readonly variableRegistry: VariableRegistry;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    protected variableRenameMap: Map<string, string> = new Map([
        ['file', 'currentFilePath'],
    ]);

    registerVariables(service: AIVariableService): void {
        this.stateService.reachedState('initialized_layout').then(() => {
            // some variable contributions in Theia are done as part of the onStart, same as our AI variable contributions
            // we therefore wait for all of them to be registered before we register we map them to our own
            this.variableRegistry.getVariables().forEach(variable => {
                const variableName = this.variableRenameMap.has(variable.name) ? this.variableRenameMap.get(variable.name)! : variable.name;
                service.registerResolver({
                    id: `theia-${variable.name}`,
                    name: variableName,
                    description: variable.description ?? nls.localize('theia/ai/core/variable-contribution/builtInVariable', 'Theia Built-in Variable')
                }, this);
            });
        });
    }

    protected toTheiaVariable(request: AIVariableResolutionRequest): string {
        return `$\{${request.variable.name}${request.arg ? ':' + request.arg : ''}}`;
    }

    async canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<number> {
        // some variables are not resolvable without providing a specific context
        // this may be expensive but was not a problem for Theia's built-in variables
        const resolved = await this.variableResolverService.resolve(this.toTheiaVariable(request), context);
        return !resolved ? 0 : 1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        const resolved = await this.variableResolverService.resolve(this.toTheiaVariable(request), context);
        return resolved ? { value: resolved, variable: request.variable } : undefined;
    }
}

