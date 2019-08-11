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

import { injectable, inject } from 'inversify';
import { VariableContribution, VariableRegistry } from './variable';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { CommandService } from '@theia/core/lib/common/command';
import { PreferenceService } from '@theia/core/lib/browser/preferences/preference-service';
import { ResourceContextKey } from '@theia/core/lib/browser/resource-context-key';
import { VariableInput } from './variable-input';
import { QuickInputService } from '@theia/core/lib/browser/quick-open/quick-input-service';
import { QuickPickService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { MaybeArray, RecursivePartial } from '@theia/core/lib/common/types';

@injectable()
export class CommonVariableContribution implements VariableContribution {

    @inject(EnvVariablesServer)
    protected readonly env: EnvVariablesServer;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(ResourceContextKey)
    protected readonly resourceContextKey: ResourceContextKey;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    async registerVariables(variables: VariableRegistry): Promise<void> {
        const execPath = await this.env.getExecPath();
        variables.registerVariable({
            name: 'execPath',
            resolve: () => execPath
        });
        variables.registerVariable({
            name: 'env',
            resolve: async (_, envVariableName) => {
                const envVariable = envVariableName && await this.env.getValue(envVariableName);
                const envValue = envVariable && envVariable.value;
                return envValue || '';
            }
        });
        variables.registerVariable({
            name: 'config',
            resolve: (resourceUri = this.resourceContextKey.get(), preferenceName) => {
                if (!preferenceName) {
                    return undefined;
                }
                return this.preferences.get(preferenceName, undefined, resourceUri && resourceUri.toString());
            }
        });
        variables.registerVariable({
            name: 'command',
            resolve: async (_, command) =>
                // tslint:disable-next-line:no-return-await
                command && await this.commands.executeCommand(command)
        });
        variables.registerVariable({
            name: 'input',
            resolve: async (resourceUri = this.resourceContextKey.get(), variable, section) => {
                if (!variable || !section) {
                    return undefined;
                }
                const configuration = this.preferences.get<RecursivePartial<{ inputs: MaybeArray<VariableInput> }>>(section, undefined, resourceUri && resourceUri.toString());
                const inputs = !!configuration && 'inputs' in configuration ? configuration.inputs : undefined;
                const input = Array.isArray(inputs) && inputs.find(item => !!item && item.id === variable);
                if (!input) {
                    return undefined;
                }
                if (input.type === 'promptString') {
                    if (typeof input.description !== 'string') {
                        return undefined;
                    }
                    return this.quickInputService.open({
                        prompt: input.description,
                        value: input.default
                    });
                }
                if (input.type === 'pickString') {
                    if (typeof input.description !== 'string' || !Array.isArray(input.options)) {
                        return undefined;
                    }
                    const elements: QuickPickItem<string>[] = [];
                    for (const option of input.options) {
                        if (typeof option !== 'string') {
                            return undefined;
                        }
                        if (option === input.default) {
                            elements.unshift({
                                description: 'Default',
                                label: option,
                                value: option
                            });
                        } else {
                            elements.push({
                                label: option,
                                value: option
                            });
                        }
                    }
                    return this.quickPickService.show(elements, { placeholder: input.description });
                }
                if (input.type === 'command') {
                    if (typeof input.command !== 'string') {
                        return undefined;
                    }
                    return this.commands.executeCommand(input.command, input.args);
                }
                return undefined;
            }
        });
    }

}
