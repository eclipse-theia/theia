/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { JsonSchemaStore } from '@theia/core/lib/browser/json-schema-store';
import { InMemoryResources, deepClone } from '@theia/core/lib/common';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import URI from '@theia/core/lib/common/uri';
import { TaskService } from './task-service';

@injectable()
export class TaskSchemaUpdater {
    @inject(JsonSchemaStore)
    protected readonly jsonSchemaStore: JsonSchemaStore;

    @inject(InMemoryResources)
    protected readonly inmemoryResources: InMemoryResources;

    @inject(TaskService)
    protected readonly taskService: TaskService;

    async update(): Promise<void> {

        const taskSchema = {
            properties: {
                tasks: {
                    type: 'array',
                    items: {
                        ...deepClone(taskConfigurationSchema)
                    }
                }
            }
        };
        const taskTypes = await this.taskService.getRegisteredTaskTypes();
        taskSchema.properties.tasks.items.oneOf![0].allOf![0].properties!.type.enum = taskTypes;
        const taskSchemaUrl = new URI('vscode://task/tasks.json');
        const contents = JSON.stringify(taskSchema);
        try {
            this.inmemoryResources.update(taskSchemaUrl, contents);
        } catch (e) {
            this.inmemoryResources.add(taskSchemaUrl, contents);
            this.jsonSchemaStore.registerSchema({
                fileMatch: ['tasks.json'],
                url: taskSchemaUrl.toString()
            });
        }
    }
}

const taskConfigurationSchema: IJSONSchema = {
    oneOf: [
        {
            'allOf': [
                {
                    type: 'object',
                    required: ['type', 'label'],
                    properties: {
                        label: {
                            type: 'string',
                            description: 'A unique string that identifies the task that is also used as task\'s user interface label'
                        },
                        type: {
                            type: 'string',
                            enum: ['shell', 'process'],
                            default: 'shell',
                            description: 'Determines what type of process will be used to execute the task. Only shell types will have output shown on the user interface'
                        },
                        command: {
                            type: 'string',
                            description: 'The actual command or script to execute'
                        },
                        args: {
                            type: 'array',
                            description: 'A list of strings, each one being one argument to pass to the command',
                            items: {
                                type: 'string'
                            }
                        },
                        options: {
                            type: 'object',
                            description: 'The command options used when the command is executed',
                            properties: {
                                cwd: {
                                    type: 'string',
                                    description: 'The directory in which the command will be executed',
                                    default: '${workspaceFolder}'
                                },
                                env: {
                                    type: 'object',
                                    description: 'The environment of the executed program or shell. If omitted the parent process\' environment is used'
                                },
                                shell: {
                                    type: 'object',
                                    description: 'Configuration of the shell when task type is `shell`',
                                    properties: {
                                        executable: {
                                            type: 'string',
                                            description: 'The shell to use'
                                        },
                                        args: {
                                            type: 'array',
                                            description: `The arguments to be passed to the shell executable to run in command mode
                                                (e.g ['-c'] for bash or ['/S', '/C'] for cmd.exe)`,
                                            items: {
                                                type: 'string'
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        windows: {
                            type: 'object',
                            description: 'Windows specific command configuration overrides command and args',
                            properties: {
                                command: {
                                    type: 'string',
                                    description: 'The actual command or script to execute'
                                },
                                args: {
                                    type: 'array',
                                    description: 'A list of strings, each one being one argument to pass to the command',
                                    items: {
                                        type: 'string'
                                    }
                                },
                            }
                        }

                    }
                }
            ]
        }
    ]
};
