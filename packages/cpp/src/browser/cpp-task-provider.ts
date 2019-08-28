/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
import { inject, injectable, postConstruct } from 'inversify';
import { ProcessTaskConfiguration } from '@theia/task/lib/common/process/task-protocol';
import { TaskContribution, TaskProvider, TaskProviderRegistry, TaskResolver, TaskResolverRegistry } from '@theia/task/lib/browser/task-contribution';
import { CppBuildConfiguration } from '../common/cpp-build-configuration-protocol';
import { CppBuildConfigurationManager } from './cpp-build-configurations';
import { ContributedTaskConfiguration, TaskConfiguration } from '@theia/task/lib/common/task-protocol';
import { TaskDefinitionRegistry } from '@theia/task/lib/browser/task-definition-registry';
import { ProblemMatcherRegistry } from '@theia/task/lib/browser/task-problem-matcher-registry';
import { ProblemPatternRegistry } from '@theia/task/lib/browser/task-problem-pattern-registry';

/**
 * Data required to define a C/C++ build task the user could run.
 */
interface CppBuildTaskConfiguration extends ContributedTaskConfiguration {
    config: CppBuildConfiguration;
}

const CPP_BUILD_TASK_TYPE_KEY: string = 'cpp.build';
const CPP_BUILD_TASK_SOURCE: string = 'cpp';

@injectable()
export class CppTaskProvider implements TaskContribution, TaskProvider, TaskResolver {

    @inject(TaskResolverRegistry) protected readonly taskResolverRegistry: TaskResolverRegistry;
    @inject(TaskDefinitionRegistry) protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;
    @inject(CppBuildConfigurationManager) protected readonly cppBuildConfigurationManager: CppBuildConfigurationManager;
    @inject(ProblemMatcherRegistry) protected readonly problemMatcherRegistry: ProblemMatcherRegistry;
    @inject(ProblemPatternRegistry) protected readonly problemPatternRegistry: ProblemPatternRegistry;

    @postConstruct()
    protected init(): void {
        this.registerTaskDefinition();
        this.problemPatternRegistry.register({
            'name': 'clangTidyPattern',
            'regexp': '^(.+):(\\d+):(\\d+):\\s+(error|warning|info|note):\\s+(.+?)\\s+\\[(.+)\\]$',
            'file': 1,
            'line': 2,
            'character': 3,
            'severity': 4,
            'message': 5,
            'code': 6
        });
        this.problemMatcherRegistry.register({
            'name': 'clangTidyMatcher',
            'label': 'Clang-tidy problems',
            'owner': 'clang-tidy',
            'source': 'clang-tidy-task',
            'applyTo': 'alldocuments',
            'fileLocation': [
                'absolute'
            ],
            'pattern': 'clangTidyPattern'
        });
    }

    registerProviders(registry: TaskProviderRegistry): void {
        registry.register(CPP_BUILD_TASK_SOURCE, this);
    }

    registerResolvers(registry: TaskResolverRegistry): void {
        registry.register(CPP_BUILD_TASK_TYPE_KEY, this);
    }

    async resolveTask(task: CppBuildTaskConfiguration): Promise<TaskConfiguration> {
        const resolver = await this.taskResolverRegistry.getResolver('shell');
        if (!resolver) {
            throw new Error('No shell resolver found, cannot build.');
        }

        const buildCommand = task.config.commands && task.config.commands['build'];
        if (buildCommand === undefined) {
            throw new Error(`No build command defined in build configuration ${task.config.name}.`);
        }

        // FIXME: the task API should allow to run commands through the shell.
        // In the mean time, we split the arguments ourselves.
        const argv: string[] = parseArgv(buildCommand);
        if (argv.length === 0) {
            throw new Error(`Empty build command in the active build configuration (${task.config.name})`);
        }
        const command: string = argv[0];
        const args: string[] = argv.slice(1);

        const resolvedTask: ProcessTaskConfiguration = {
            ...task,
            type: 'shell',
            command,
            args,
            cwd: task.config.directory,
        };
        return resolver.resolveTask(resolvedTask);
    }

    /**
     * Return a C/C++ build task configuration based on `config`, or undefined
     * if `config` doesn't specify a build command.
     */
    makeTaskConfiguration(config: CppBuildConfiguration): CppBuildTaskConfiguration | undefined {
        if (config.commands && config.commands.build) {
            return {
                type: CPP_BUILD_TASK_TYPE_KEY,
                _source: CPP_BUILD_TASK_SOURCE,
                _scope: config.directory,
                label: `C/C++ Build - ${config.name}`,
                config
            };
        }

        return undefined;
    }

    /**
     * Return the C/C++ build tasks (one task per existing build config).
     */
    async provideTasks(): Promise<CppBuildTaskConfiguration[]> {
        const buildConfigs = this.cppBuildConfigurationManager.getConfigs();
        const taskConfigs: CppBuildTaskConfiguration[] = [];
        for (const buildConfig of buildConfigs) {
            const taskConfig = this.makeTaskConfiguration(buildConfig);
            if (taskConfig) {
                taskConfigs.push(taskConfig);
            }
        }

        return taskConfigs;
    }

    private registerTaskDefinition(): void {
        this.taskDefinitionRegistry.register({
            taskType: CPP_BUILD_TASK_TYPE_KEY,
            source: 'cpp',
            properties: {
                required: ['label'],
                all: ['label']
            }
        });
    }
}
