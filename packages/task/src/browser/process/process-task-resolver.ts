// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { TaskResolver } from '../task-contribution';
import { TaskConfiguration } from '../../common/task-protocol';
import { CommandProperties, ProcessTaskConfiguration } from '../../common/process/task-protocol';
import { TaskDefinitionRegistry } from '../task-definition-registry';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { cancelled } from '@theia/core/lib/common/cancellation';

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
        const type = taskConfig.executionType || taskConfig.type;
        if (type !== 'process' && type !== 'shell') {
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

        const commandProperties = await this.resolveCommandProperties(processTaskConfig, variableResolverOptions);
        const result: ProcessTaskConfiguration = {
            ...processTaskConfig,
            ...commandProperties,
            windows: await this.resolveCommandProperties(processTaskConfig.windows, variableResolverOptions),
            osx: await this.resolveCommandProperties(processTaskConfig.osx, variableResolverOptions),
            linux: await this.resolveCommandProperties(processTaskConfig.linux, variableResolverOptions),
            options: {
                cwd: await this.variableResolverService.resolve(cwd, variableResolverOptions),
                env: processTaskConfig.options?.env && await this.variableResolverService.resolve(processTaskConfig.options.env, variableResolverOptions),
                shell: processTaskConfig.options && processTaskConfig.options.shell
            }
        };
        return result;
    }

    protected async resolveCommandProperties(
        properties: CommandProperties | undefined,
        variableResolverOptions: { context: URI | undefined; configurationSection: string }
    ): Promise<CommandProperties | undefined> {
        if (!properties) {
            return undefined;
        }
        const command = properties.command === undefined
            ? undefined
            : await this.variableResolverService.resolve(properties.command, variableResolverOptions);
        const args = properties.args === undefined
            ? undefined
            : await this.variableResolverService.resolve(properties.args, variableResolverOptions);
        if ((properties.command !== undefined && command === undefined)
            || (properties.args !== undefined && args === undefined)) {
            throw cancelled();
        }
        return {
            command,
            args,
            options: properties.options
        };
    }
}
