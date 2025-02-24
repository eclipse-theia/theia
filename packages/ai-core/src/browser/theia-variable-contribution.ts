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

    private static readonly THEIA_PREFIX = 'theia-';

    @inject(VariableResolverService)
    protected readonly variableResolverService: VariableResolverService;

    @inject(VariableRegistry)
    protected readonly variableRegistry: VariableRegistry;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    // Map original variable name to new name and description. If a mapped value is not present then the original will be kept.
    // Only variables present in this map are registered.
    protected variableRenameMap: Map<string, { name?: string, description?: string }> = new Map([
        ['file', {
            name: 'currentAbsoluteFilePath', description: nls.localize('theia/ai/core/variable-contribution/currentAbsoluteFilePath', 'The absolute path of the \
            currently opened file. Please note that most agents will expect a relative file path (relative to the current workspace).')
        }],
        ['selectedText', {
            description: nls.localize('theia/ai/core/variable-contribution/currentSelectedText', 'The plain text that is currently selected in the \
            opened file. This excludes the information where the content is coming from. Please note that most agents will work better with a relative file path \
            (relative to the current workspace).')
        }],
        ['currentText', {
            name: 'currentFileContent', description: nls.localize('theia/ai/core/variable-contribution/currentFileContent', 'The plain content of the \
            currently opened file. This excludes the information where the content is coming from. Please note that most agents will work better with a relative file path \
            (relative to the current workspace).')
        }],
        ['relativeFile', {
            name: 'currentRelativeFilePath', description: nls.localize('theia/ai/core/variable-contribution/currentRelativeFilePath', 'The relative path of the \
            currently opened file.')
        }],
        ['relativeFileDirname', {
            name: 'currentRelativeDirPath', description: nls.localize('theia/ai/core/variable-contribution/currentRelativeDirPath', 'The relative path of the directory \
            containing the currently opened file.')
        }],
        ['lineNumber', {}],
        ['workspaceFolder', {}]
    ]);

    registerVariables(service: AIVariableService): void {
        this.stateService.reachedState('initialized_layout').then(() => {
            // some variable contributions in Theia are done as part of the onStart, same as our AI variable contributions
            // we therefore wait for all of them to be registered before we register we map them to our own
            this.variableRegistry.getVariables().forEach(variable => {
                if (!this.variableRenameMap.has(variable.name)) {
                    return; // Do not register variables not part of the map
                }
                const mapping = this.variableRenameMap.get(variable.name)!;
                const newName = (mapping.name && mapping.name.trim() !== '') ? mapping.name : variable.name;
                const newDescription = (mapping.description && mapping.description.trim() !== '') ? mapping.description
                    : (variable.description && variable.description.trim() !== '' ? variable.description
                        : nls.localize('theia/ai/core/variable-contribution/builtInVariable', 'Theia Built-in Variable'));

                service.registerResolver({
                    id: `${TheiaVariableContribution.THEIA_PREFIX}${variable.name}`,
                    name: newName,
                    description: newDescription
                }, this);
            });
        });
    }

    protected toTheiaVariable(request: AIVariableResolutionRequest): string {
        // Remove the THEIA_PREFIX if present before constructing the variable string
        const variableId = request.variable.id.startsWith(TheiaVariableContribution.THEIA_PREFIX) ? request.variable.id.slice(TheiaVariableContribution.THEIA_PREFIX.length) :
            request.variable.id;
        return `\${${variableId}${request.arg ? ':' + request.arg : ''}}`;
    }

    async canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<number> {
        if (!request.variable.id.startsWith(TheiaVariableContribution.THEIA_PREFIX)) {
            return 0;
        }
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
