/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { TaskResolver } from '../task-contribution';
import { TaskConfiguration } from '../../common/task-protocol';
import { ProcessTaskConfiguration } from '../../common/process/task-protocol';

@injectable()
export class ProcessTaskResolver implements TaskResolver {

    @inject(VariableResolverService)
    protected readonly variableResolverService: VariableResolverService;

    /**
     * Perform some adjustments to the task launch configuration, before sending
     * it to the backend to be executed. We can make sure that parameters that
     * are optional to the user but required by the server will be defined, with
     * sane default values. Also, resolve all known variables, e.g. `${workspaceFolder}`.
     */
    async resolveTask(taskConfig: TaskConfiguration): Promise<TaskConfiguration> {
        if (taskConfig.type !== 'process' && taskConfig.type !== 'shell') {
            throw new Error('Unsupported task configuration type.');
        }
        const processTaskConfig = taskConfig as ProcessTaskConfiguration;
        const result: ProcessTaskConfiguration = {
            type: processTaskConfig.type,
            label: processTaskConfig.label,
            command: await this.variableResolverService.resolve(processTaskConfig.command),
            args: processTaskConfig.args ? await this.variableResolverService.resolveArray(processTaskConfig.args) : undefined,
            options: processTaskConfig.options,
            windows: processTaskConfig.windows ? {
                command: await this.variableResolverService.resolve(processTaskConfig.windows.command),
                args: processTaskConfig.args ? await this.variableResolverService.resolveArray(processTaskConfig.args) : undefined,
                options: processTaskConfig.windows.options
            } : undefined,
            cwd: await this.variableResolverService.resolve(processTaskConfig.cwd ? processTaskConfig.cwd : '${workspaceFolder}')
        };
        return result;
    }
}
