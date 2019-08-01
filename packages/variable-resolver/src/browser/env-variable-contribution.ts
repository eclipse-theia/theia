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

@injectable()
export class EnvVariableContribution implements VariableContribution {

    @inject(EnvVariablesServer)
    protected readonly env: EnvVariablesServer;

    async registerVariables(variables: VariableRegistry): Promise<void> {
        const execPath = await this.env.getExecPath();
        variables.registerVariable({
            name: 'execPath',
            resolve: () => execPath
        });
        variables.registerVariable({
            name: 'env',
            resolve: async (_, argument) => {
                const envVariable = argument && await this.env.getValue(argument);
                return envVariable && envVariable.value;
            }
        });
    }

}
