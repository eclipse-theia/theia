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

import { injectable, inject } from 'inversify';
import { TaskService } from '@theia/task/lib/browser';
import { CppBuildConfiguration, CppBuildTaskConfiguration } from './cpp-build-configurations';

@injectable()
export class CppBuildManager {

    @inject(TaskService) protected readonly taskService: TaskService;

    async runConfiguration(cppConfig: CppBuildConfiguration, options?: Partial<CppBuildTaskConfiguration>): Promise<void> {
        const taskConfig = await this.getTaskConfiguration(cppConfig, options);
        await this.taskService.runTask(taskConfig);
    }

    async getTaskConfiguration(cppConfig: CppBuildConfiguration, options: Partial<CppBuildTaskConfiguration> = {}): Promise<CppBuildTaskConfiguration> {
        const command = cppConfig.commands && cppConfig.commands.build || await this.guessBuildCommand(cppConfig);
        return {
            type: 'cpp.build',
            configuration: cppConfig,
            cwd: cppConfig.directory,
            label: cppConfig.name,
            command,

            // override:
            ...options,

        } as CppBuildTaskConfiguration;
    }

    async guessBuildCommand(cppConfig: CppBuildConfiguration): Promise<string> {
        throw new Error('TODO');
    }

    async getTargets(cppConfig: CppBuildConfiguration): Promise<string[]> {
        return [];
    }
}
