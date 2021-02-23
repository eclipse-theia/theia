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

import { injectable, inject } from '@theia/core/shared/inversify';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { TaskResolver } from '../task-contribution';
import { TaskConfiguration } from '../../common/task-protocol';
import { ProcessTaskConfiguration } from '../../common/process/task-protocol';
import { TaskDefinitionRegistry } from '../task-definition-registry';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';

@injectable()
export class ProcessTaskResolver implements TaskResolver {

    @inject(VariableResolverService)
    protected readonly variableResolverService: VariableResolverService;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

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
        const context = typeof taskConfig._scope === 'string' ? new URI(taskConfig._scope) : undefined;
        const variableResolverOptions = {
            context, configurationSection: 'tasks'
        };
        const processTaskConfig = taskConfig as ProcessTaskConfiguration;
        let cwd = processTaskConfig.options && processTaskConfig.options.cwd;
        if (!cwd) {
            const rootURI = this.workspaceService.getWorkspaceRootUri(context);
            if (rootURI) {
                cwd = rootURI.toString();
            }
        }

        const result: ProcessTaskConfiguration = {
            ...processTaskConfig,
            command: await this.variableResolverService.resolve(processTaskConfig.command, variableResolverOptions),
            args: processTaskConfig.args ? await this.variableResolverService.resolveArray(processTaskConfig.args, variableResolverOptions) : undefined,
            windows: processTaskConfig.windows ? {
                command: await this.variableResolverService.resolve(processTaskConfig.windows.command, variableResolverOptions),
                args: processTaskConfig.windows.args ? await this.variableResolverService.resolveArray(processTaskConfig.windows.args, variableResolverOptions) : undefined,
                options: processTaskConfig.windows.options
            } : undefined,
            osx: processTaskConfig.osx ? {
                command: await this.variableResolverService.resolve(processTaskConfig.osx.command, variableResolverOptions),
                args: processTaskConfig.osx.args ? await this.variableResolverService.resolveArray(processTaskConfig.osx.args, variableResolverOptions) : undefined,
                options: processTaskConfig.osx.options
            } : undefined,
            linux: processTaskConfig.linux ? {
                command: await this.variableResolverService.resolve(processTaskConfig.linux.command, variableResolverOptions),
                args: processTaskConfig.linux.args ? await this.variableResolverService.resolveArray(processTaskConfig.linux.args, variableResolverOptions) : undefined,
                options: processTaskConfig.linux.options
            } : undefined,
            options: {
                cwd: await this.variableResolverService.resolve(cwd, variableResolverOptions),
                env: processTaskConfig.options && processTaskConfig.options.env,
                shell: processTaskConfig.options && processTaskConfig.options.shell
            }
        };
        return result;
    }
}
