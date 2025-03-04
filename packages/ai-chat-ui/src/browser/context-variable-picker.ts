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

import { AIContextVariable, AIVariableResolutionRequest, AIVariableService, PromptText } from '@theia/ai-core';
import { QuickInputService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';

const QUERY_CONTEXT = { type: 'context-variable-picker' };

@injectable()
export class ContextVariablePicker {

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    async pickContextVariable(): Promise<AIVariableResolutionRequest | undefined> {
        const variables = this.variableService.getContextVariables();
        const selection = await this.quickInputService.showQuickPick(
            variables.map(v => ({
                id: v.id,
                label: v.label ?? v.name,
                variable: v,
                iconClasses: v.iconClasses,
            })),
            { placeholder: 'Select a context variable to be attached to the message', }
        );
        if (!selection) {
            return undefined;
        }

        const variable = selection.variable;
        if (!variable.args || variable.args.length === 0) {
            return { variable };
        }

        const argumentPicker = await this.variableService.getArgumentPicker(variable.name, QUERY_CONTEXT);
        if (!argumentPicker) {
            return this.useGenericArgumentPicker(variable);
        }
        const arg = await argumentPicker(QUERY_CONTEXT);
        if (!arg) {
            return undefined;
        }

        return { variable, arg };
    }

    protected async useGenericArgumentPicker(variable: AIContextVariable): Promise<AIVariableResolutionRequest | undefined> {
        const args: string[] = [];
        for (const argument of variable.args ?? []) {
            const placeHolder = argument.description;
            let input: string | undefined;
            if (argument.enum) {
                const picked = await this.quickInputService.pick(
                    argument.enum.map(enumItem => ({ label: enumItem })),
                    { placeHolder, canPickMany: false }
                );
                input = picked?.label;
            } else {
                input = await this.quickInputService.input({ placeHolder });
            }
            if (!input && !argument.isOptional) {
                return;
            }
            args.push(input ?? '');
        }
        return { variable, arg: args.join(PromptText.VARIABLE_SEPARATOR_CHAR) };
    }
}
