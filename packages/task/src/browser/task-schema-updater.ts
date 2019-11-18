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
import { injectable, inject, postConstruct } from 'inversify';
import { JsonSchemaStore } from '@theia/core/lib/browser/json-schema-store';
import { InMemoryResources, deepClone } from '@theia/core/lib/common';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { inputsSchema } from '@theia/variable-resolver/lib/browser/variable-input-schema';
import URI from '@theia/core/lib/common/uri';
import { ProblemMatcherRegistry } from './task-problem-matcher-registry';
import { TaskDefinitionRegistry } from './task-definition-registry';
import { TaskServer } from '../common';

export const taskSchemaId = 'vscode://schemas/tasks';

@injectable()
export class TaskSchemaUpdater {
    @inject(JsonSchemaStore)
    protected readonly jsonSchemaStore: JsonSchemaStore;

    @inject(InMemoryResources)
    protected readonly inmemoryResources: InMemoryResources;

    @inject(ProblemMatcherRegistry)
    protected readonly problemMatcherRegistry: ProblemMatcherRegistry;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(TaskServer)
    protected readonly taskServer: TaskServer;

    @postConstruct()
    protected init(): void {
        this.updateProblemMatcherNames();
        this.updateSupportedTaskTypes();
        // update problem matcher names in the task schema every time a problem matcher is added or disposed
        this.problemMatcherRegistry.onDidChangeProblemMatcher(() => this.updateProblemMatcherNames());
        // update supported task types in the task schema every time a task definition is registered or removed
        this.taskDefinitionRegistry.onDidRegisterTaskDefinition(() => this.updateSupportedTaskTypes());
        this.taskDefinitionRegistry.onDidUnregisterTaskDefinition(() => this.updateSupportedTaskTypes());
    }

    update(): void {
        const taskSchemaUri = new URI(taskSchemaId);

        taskConfigurationSchema.oneOf = [processTaskConfigurationSchema, ...customizedDetectedTasks, ...customSchemas];

        const schemaContent = this.getStrigifiedTaskSchema();
        try {
            this.inmemoryResources.update(taskSchemaUri, schemaContent);
        } catch (e) {
            this.inmemoryResources.add(taskSchemaUri, schemaContent);
            this.jsonSchemaStore.registerSchema({
                fileMatch: ['tasks.json'],
                url: taskSchemaUri.toString()
            });
        }
    }

    /**
     * Adds given task schema to `taskConfigurationSchema` as `oneOf` subschema.
     * Replaces existed subschema by given schema if the corrresponding `$id` properties are equal.
     *
     * Note: please provide `$id` property for subschema to have ability remove/replace it.
     * @param schema subschema for adding to `taskConfigurationSchema`
     */
    addSubschema(schema: IJSONSchema): void {
        const schemaId = schema.$id;
        if (schemaId) {
            this.doRemoveSubschema(schemaId);
        }

        customSchemas.push(schema);
        this.update();
    }

    /**
     * Removes task subschema from `taskConfigurationSchema`.
     *
     * @param arg `$id` property of subschema
     */
    removeSubschema(arg: string): void {
        const isRemoved = this.doRemoveSubschema(arg);
        if (isRemoved) {
            this.update();
        }
    }

    /**
     * Removes task subschema from `customSchemas`, use `update()` to apply the changes for `taskConfigurationSchema`.
     *
     * @param arg `$id` property of subschema
     * @returns `true` if subschema was removed, `false` otherwise
     */
    protected doRemoveSubschema(arg: string): boolean {
        const index = customSchemas.findIndex(existed => !!existed.$id && existed.$id === arg);
        if (index > -1) {
            customSchemas.splice(index, 1);
            return true;
        }
        return false;
    }

    /** Returns an array of task types that are registered, including the default types */
    async getRegisteredTaskTypes(): Promise<string[]> {
        const serverSupportedTypes = await this.taskServer.getRegisteredTaskTypes();
        const browserSupportedTypes = this.taskDefinitionRegistry.getAll().map(def => def.taskType);
        const allTypes = new Set([...serverSupportedTypes, ...browserSupportedTypes]);
        return Array.from(allTypes.values()).sort();
    }

    private updateSchemasForRegisteredTasks(): void {
        customizedDetectedTasks.length = 0;
        const definitions = this.taskDefinitionRegistry.getAll();
        definitions.forEach(def => {
            const customizedDetectedTask = {
                type: 'object',
                required: ['type'],
                properties: {}
            } as IJSONSchema;
            const taskType = {
                ...defaultTaskType,
                enum: [def.taskType],
                default: def.taskType,
                description: 'The task type to customize'
            };
            customizedDetectedTask.properties!.type = taskType;
            def.properties.all.forEach(taskProp => {
                if (!!def.properties.required.find(requiredProp => requiredProp === taskProp)) { // property is mandatory
                    customizedDetectedTask.required!.push(taskProp);
                }
                customizedDetectedTask.properties![taskProp] = { ...def.properties.schema.properties![taskProp] };
            });
            customizedDetectedTask.properties!.problemMatcher = problemMatcher;
            customizedDetectedTask.properties!.options = commandOptionsSchema;
            customizedDetectedTask.properties!.group = group;
            customizedDetectedTask.additionalProperties = true;
            customizedDetectedTasks.push(customizedDetectedTask);
        });
    }

    /** Returns the task's JSON schema */
    getTaskSchema(): IJSONSchema {
        return {
            type: 'object',
            properties: {
                version: {
                    type: 'string'
                },
                tasks: {
                    type: 'array',
                    items: {
                        ...deepClone(taskConfigurationSchema)
                    }
                },
                inputs: inputsSchema.definitions!.inputs
            },
            additionalProperties: false
        };
    }

    /** Returns the task's JSON schema as a string */
    private getStrigifiedTaskSchema(): string {
        return JSON.stringify(this.getTaskSchema());
    }

    /** Gets the most up-to-date names of problem matchers from the registry and update the task schema */
    private updateProblemMatcherNames(): void {
        const matcherNames = this.problemMatcherRegistry.getAll().map(m => m.name.startsWith('$') ? m.name : `$${m.name}`);
        problemMatcherNames.length = 0;
        problemMatcherNames.push(...matcherNames);
        this.update();
    }

    private async updateSupportedTaskTypes(): Promise<void> {
        this.updateSchemasForRegisteredTasks();
        this.update();
    }
}

const commandSchema: IJSONSchema = {
    type: 'string',
    description: 'The actual command or script to execute'
};

const commandArgSchema: IJSONSchema = {
    type: 'array',
    description: 'A list of strings, each one being one argument to pass to the command',
    items: {
        type: 'string'
    }
};

const commandOptionsSchema: IJSONSchema = {
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
};

const problemMatcherNames: string[] = [];
const defaultTaskTypes = ['shell', 'process'];
const supportedTaskTypes = [...defaultTaskTypes];
const taskLabel = {
    type: 'string',
    description: 'A unique string that identifies the task that is also used as task\'s user interface label'
};
const defaultTaskType = {
    type: 'string',
    enum: supportedTaskTypes,
    default: defaultTaskTypes[0],
    description: 'Determines what type of process will be used to execute the task. Only shell types will have output shown on the user interface'
};
const commandAndArgs = {
    command: commandSchema,
    args: commandArgSchema,
    options: commandOptionsSchema
};
const problemMatcher = {
    oneOf: [
        {
            type: 'string',
            description: 'Name of the problem matcher to parse the output of the task',
            enum: problemMatcherNames
        },
        {
            type: 'object',
            description: 'User defined problem matcher(s) to parse the output of the task',
        },
        {
            type: 'array',
            description: 'Name(s) of the problem matcher(s) to parse the output of the task',
            items: {
                type: 'string',
                enum: problemMatcherNames
            }
        }
    ]
};
const group = {
    oneOf: [
        {
            type: 'string'
        },
        {
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    default: 'none',
                    description: 'The task\'s execution group.'
                },
                isDefault: {
                    type: 'boolean',
                    default: false,
                    description: 'Defines if this task is the default task in the group.'
                }
            }
        }
    ],
    enum: [
        { kind: 'build', isDefault: true },
        { kind: 'test', isDefault: true },
        'build',
        'test',
        'none'
    ],
    enumDescriptions: [
        'Marks the task as the default build task.',
        'Marks the task as the default test task.',
        'Marks the task as a build task accessible through the \'Run Build Task\' command.',
        'Marks the task as a test task accessible through the \'Run Test Task\' command.',
        'Assigns the task to no group'
    ],
    // tslint:disable-next-line:max-line-length
    description: 'Defines to which execution group this task belongs to. It supports "build" to add it to the build group and "test" to add it to the test group.'
};

const processTaskConfigurationSchema: IJSONSchema = {
    type: 'object',
    required: ['type', 'label', 'command'],
    properties: {
        label: taskLabel,
        type: defaultTaskType,
        ...commandAndArgs,
        windows: {
            type: 'object',
            description: 'Windows specific command configuration that overrides the command, args, and options',
            properties: commandAndArgs
        },
        osx: {
            type: 'object',
            description: 'MacOS specific command configuration that overrides the command, args, and options',
            properties: commandAndArgs
        },
        linux: {
            type: 'object',
            description: 'Linux specific command configuration that overrides the default command, args, and options',
            properties: commandAndArgs
        },
        group,
        problemMatcher
    },
    additionalProperties: true
};

const customizedDetectedTasks: IJSONSchema[] = [];
const customSchemas: IJSONSchema[] = [];

const taskConfigurationSchema: IJSONSchema = {
    $id: taskSchemaId,
    oneOf: [processTaskConfigurationSchema, ...customizedDetectedTasks, ...customSchemas]
};
