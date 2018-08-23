/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import parseArgv = require('string-argv');
import { inject, injectable } from 'inversify';
import { VariableResolverService, VariableContext } from '@theia/variable-resolver/lib/browser';
import { ProcessTaskConfiguration } from '@theia/task/lib/common/process/task-protocol';
import { TaskContribution, TaskProvider, TaskProviderRegistry, TaskResolver, TaskResolverRegistry } from '@theia/task/lib/browser';
import { CppBuildConfigurationManager, CppBuildConfiguration, CppBuildTaskConfiguration } from './cpp-build-configurations';
import { CppBuildManager } from './cpp-build-manager';
import { TaskConfiguration } from '@theia/task/lib/common/task-protocol';

export const CppTaskContext = Symbol('CppTaskContext');
export interface CppTaskContext {
    buildConfiguration: CppBuildConfiguration;
    buildTarget?: string;
}

@injectable()
export class CppTaskProvider implements TaskContribution, TaskProvider, TaskResolver {

    @inject(TaskResolverRegistry) protected readonly taskResolverRegistry: TaskResolverRegistry;
    @inject(VariableResolverService) protected readonly variableResolverService: VariableResolverService;
    @inject(CppBuildConfigurationManager) protected readonly cppBuildConfigurationManager: CppBuildConfigurationManager;
    @inject(CppBuildManager) protected readonly cppBuildManager: CppBuildManager;

    registerProviders(registry: TaskProviderRegistry) {
        registry.register('cpp.build', this);
    }

    registerResolvers(registry: TaskResolverRegistry) {
        registry.register('cpp.build', this);
    }

    async resolveTask(task: CppBuildTaskConfiguration) {
        const resolver = this.taskResolverRegistry.getResolver('shell');
        if (!resolver) {
            throw new Error('No shell resolver found, cannot build...');
        }

        const taskContext: VariableContext = {
            [CppTaskContext]: <CppTaskContext>{
                buildConfiguration: task.configuration,
                buildTarget: task.target,
            }
        };

        const argv: string[] = parseArgv(await this.variableResolverService.resolve(task.command, taskContext));
        if (argv.length === 0) {
            throw new Error(`Invalid command in the build configuration "${task.label}"`);
        }
        const command: string = argv[0];
        const args: string[] = argv.slice(1);

        const resolvedTask: ProcessTaskConfiguration = {
            ...task,
            type: 'shell',
            command,
            args,
        };
        return resolver.resolveTask(resolvedTask);
    }

    async provideTasks() {
        const configs = this.cppBuildConfigurationManager.getConfigs();
        const active = this.cppBuildConfigurationManager.getActiveConfig();
        const tasks: TaskConfiguration[] = [];

        await Promise.all(configs.map(config => {
            // tslint:disable-next-line:no-any
            const options: any = {};
            if (active && active === config) {
                options.label = `${config.name} [active]`;
            }
            return this.cppBuildManager.getTaskConfiguration(config, options)
                .then(task => tasks.push({
                    ...task,
                    label: `Build ${task.label}`,
                }))
                .catch(e => undefined);
        }));

        return tasks;
    }
}
