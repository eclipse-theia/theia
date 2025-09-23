// *****************************************************************************
// Copyright (C) 2019 Red Hat, Inc. and others.
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
// This file is inspired by VSCode and partially copied from https://github.com/Microsoft/vscode/blob/1.33.1/src/vs/workbench/contrib/tasks/common/problemMatcher.ts
// 'problemMatcher.ts' copyright:
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Ajv from '@theia/core/shared/ajv';
import debounce = require('p-debounce');
import { postConstruct, injectable, inject } from '@theia/core/shared/inversify';
import { JsonSchemaContribution, JsonSchemaDataStore, JsonSchemaRegisterContext } from '@theia/core/lib/browser/json-schema-store';
import { deepClone, Emitter, nls } from '@theia/core/lib/common';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { inputsSchema } from '@theia/variable-resolver/lib/browser/variable-input-schema';
import URI from '@theia/core/lib/common/uri';
import { ProblemMatcherRegistry } from './task-problem-matcher-registry';
import { TaskDefinitionRegistry } from './task-definition-registry';
import { TaskServer, asVariableName } from '../common';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { JSONObject } from '@theia/core/shared/@lumino/coreutils';
import { taskSchemaId } from '../common/task-preferences';

@injectable()
export class TaskSchemaUpdater implements JsonSchemaContribution {

    @inject(JsonSchemaDataStore)
    protected readonly jsonSchemaData: JsonSchemaDataStore;

    @inject(ProblemMatcherRegistry)
    protected readonly problemMatcherRegistry: ProblemMatcherRegistry;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(TaskServer)
    protected readonly taskServer: TaskServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly onDidChangeTaskSchemaEmitter = new Emitter<void>();
    readonly onDidChangeTaskSchema = this.onDidChangeTaskSchemaEmitter.event;

    protected readonly uri = new URI(taskSchemaId);

    @postConstruct()
    protected init(): void {
        this.jsonSchemaData.setSchema(this.uri, '');
        this.updateProblemMatcherNames();
        this.updateSupportedTaskTypes();
        // update problem matcher names in the task schema every time a problem matcher is added or disposed
        this.problemMatcherRegistry.onDidChangeProblemMatcher(() => this.updateProblemMatcherNames());
        // update supported task types in the task schema every time a task definition is registered or removed
        this.taskDefinitionRegistry.onDidRegisterTaskDefinition(() => this.updateSupportedTaskTypes());
        this.taskDefinitionRegistry.onDidUnregisterTaskDefinition(() => this.updateSupportedTaskTypes());
    }

    registerSchemas(context: JsonSchemaRegisterContext): void {
        context.registerSchema({
            fileMatch: ['tasks.json', UserStorageUri.resolve('tasks.json').toString()],
            url: this.uri.toString()
        });
        this.workspaceService.updateSchema('tasks', { $ref: this.uri.toString() });
    }

    readonly update = debounce(() => this.doUpdate(), 0);
    protected doUpdate(): void {
        taskConfigurationSchema.anyOf = [processTaskConfigurationSchema, ...customizedDetectedTasks, ...customSchemas];

        const schema = this.getTaskSchema();
        this.doValidate = new Ajv().compile(schema);
        this.jsonSchemaData.setSchema(this.uri, schema);
        this.onDidChangeTaskSchemaEmitter.fire(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validate(data: any): boolean {
        return !!this.doValidate && !!this.doValidate(data);
    }
    protected doValidate: Ajv.ValidateFunction | undefined;

    /**
     * Adds given task schema to `taskConfigurationSchema` as `oneOf` subschema.
     * Replaces existed subschema by given schema if the corresponding `$id` properties are equal.
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
            const customizedDetectedTask: IJSONSchema = {
                type: 'object',
                required: ['type'],
                properties: {}
            };
            const taskType = {
                ...defaultTaskType,
                enum: [def.taskType],
                default: def.taskType,
                description: nls.localizeByDefault('The task type to customize')
            };
            customizedDetectedTask.properties!.type = taskType;
            const required = def.properties.required || [];
            def.properties.all.forEach(taskProp => {
                if (required.find(requiredProp => requiredProp === taskProp)) { // property is mandatory
                    customizedDetectedTask.required!.push(taskProp);
                }
                customizedDetectedTask.properties![taskProp] = { ...def.properties.schema.properties![taskProp] };
            });
            customizedDetectedTask.properties!.label = taskLabel;
            customizedDetectedTask.properties!.problemMatcher = problemMatcher;
            customizedDetectedTask.properties!.presentation = presentation;
            customizedDetectedTask.properties!.options = commandOptionsSchema;
            customizedDetectedTask.properties!.group = group;
            customizedDetectedTask.properties!.detail = detail;
            customizedDetectedTask.additionalProperties = true;
            customizedDetectedTasks.push(customizedDetectedTask);
        });
    }

    /** Returns the task's JSON schema */
    getTaskSchema(): IJSONSchema & { default: JSONObject } {
        return {
            type: 'object',
            default: { version: '2.0.0', tasks: [] },
            properties: {
                version: {
                    type: 'string',
                    default: '2.0.0',
                    description: nls.localizeByDefault("The config's version number.")
                },
                tasks: {
                    type: 'array',
                    items: {
                        ...deepClone(taskConfigurationSchema)
                    },
                    description: nls.localizeByDefault('The task configurations. Usually these are enrichments of task already defined in the external task runner.')
                },
                inputs: inputsSchema.definitions!.inputs
            },
            additionalProperties: false,
            allowComments: true,
            allowTrailingCommas: true,
        };
    }

    /** Gets the most up-to-date names of problem matchers from the registry and update the task schema */
    private updateProblemMatcherNames(): void {
        const matcherNames = this.problemMatcherRegistry.getAll().map(m => asVariableName(m.name));
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
    description: nls.localizeByDefault('The command to be executed. Can be an external program or a shell command.')
};

const commandArgSchema: IJSONSchema = {
    type: 'array',
    description: nls.localizeByDefault('Arguments passed to the command when this task is invoked.'),
    items: {
        type: 'string'
    }
};

const commandOptionsSchema: IJSONSchema = {
    type: 'object',
    description: nls.localizeByDefault('Additional command options'),
    properties: {
        cwd: {
            type: 'string',
            description: nls.localize('theia/task/schema/commandOptions/cwd',
                "The current working directory of the executed program or script. If omitted Theia's current workspace root is used."),
            default: '${workspaceFolder}'
        },
        env: {
            type: 'object',
            description: nls.localizeByDefault("The environment of the executed program or shell. If omitted the parent process' environment is used.")
        },
        shell: {
            type: 'object',
            description: nls.localizeByDefault('Configures the shell to be used.'),
            properties: {
                executable: {
                    type: 'string',
                    description: nls.localizeByDefault('The shell to be used.')
                },
                args: {
                    type: 'array',
                    description: nls.localizeByDefault('The shell arguments.'),
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
const taskLabel: IJSONSchema = {
    type: 'string',
    description: nls.localizeByDefault("The task's user interface label")
};
const defaultTaskType: IJSONSchema = {
    type: 'string',
    enum: supportedTaskTypes,
    default: defaultTaskTypes[0],
    description: nls.localizeByDefault('Defines whether the task is run as a process or as a command inside a shell.')
} as const;
const commandAndArgs = {
    command: commandSchema,
    args: commandArgSchema,
    options: commandOptionsSchema
};

const group: IJSONSchema = {
    oneOf: [
        {
            type: 'string',
            enum: ['build', 'test', 'none'],
            enumDescriptions: [
                nls.localizeByDefault("Marks the task as a build task accessible through the 'Run Build Task' command."),
                nls.localizeByDefault("Marks the task as a test task accessible through the 'Run Test Task' command."),
                nls.localizeByDefault('Assigns the task to no group')
            ]
        },
        {
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    default: 'none',
                    description: nls.localizeByDefault("The task's execution group."),
                    enum: ['build', 'test', 'none'],
                    enumDescriptions: [
                        nls.localizeByDefault("Marks the task as a build task accessible through the 'Run Build Task' command."),
                        nls.localizeByDefault("Marks the task as a test task accessible through the 'Run Test Task' command."),
                        nls.localizeByDefault('Assigns the task to no group')
                    ]
                },
                isDefault: {
                    type: 'boolean',
                    default: false,
                    description: nls.localizeByDefault('Defines if this task is the default task in the group, or a glob to match the file which should trigger this task.')
                }
            }
        }
    ],
    description: nls.localizeByDefault(
        'Defines to which execution group this task belongs to. It supports "build" to add it to the build group and "test" to add it to the test group.')
};

const problemPattern: IJSONSchema = {
    default: {
        regexp: '^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$',
        file: 1,
        location: 2,
        message: 3
    },
    type: 'object',
    properties: {
        regexp: {
            type: 'string',
            description: nls.localizeByDefault('The regular expression to find an error, warning or info in the output.')
        },
        kind: {
            type: 'string',
            description: nls.localizeByDefault('whether the pattern matches a location (file and line) or only a file.')
        },
        file: {
            type: 'integer',
            description: nls.localizeByDefault('The match group index of the filename. If omitted 1 is used.')
        },
        location: {
            type: 'integer',
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault("The match group index of the problem's location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted (line,column) is assumed.")
        },
        line: {
            type: 'integer',
            description: nls.localizeByDefault("The match group index of the problem's line. Defaults to 2")
        },
        column: {
            type: 'integer',
            description: nls.localizeByDefault("The match group index of the problem's line character. Defaults to 3")
        },
        endLine: {
            type: 'integer',
            description: nls.localizeByDefault("The match group index of the problem's end line. Defaults to undefined")
        },
        endColumn: {
            type: 'integer',
            description: nls.localizeByDefault("The match group index of the problem's end line character. Defaults to undefined")
        },
        severity: {
            type: 'integer',
            description: nls.localizeByDefault("The match group index of the problem's severity. Defaults to undefined")
        },
        code: {
            type: 'integer',
            description: nls.localizeByDefault("The match group index of the problem's code. Defaults to undefined")
        },
        message: {
            type: 'integer',
            description: nls.localizeByDefault('The match group index of the message. If omitted it defaults to 4 if location is specified. Otherwise it defaults to 5.')
        },
        loop: {
            type: 'boolean',
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('In a multi line matcher loop indicated whether this pattern is executed in a loop as long as it matches. Can only specified on a last pattern in a multi line pattern.')
        }
    }
};

const multiLineProblemPattern: IJSONSchema = {
    type: 'array',
    items: problemPattern
};

const watchingPattern: IJSONSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        regexp: {
            type: 'string',
            description: nls.localizeByDefault('The regular expression to detect the begin or end of a background task.')
        },
        file: {
            type: 'integer',
            description: nls.localizeByDefault('The match group index of the filename. Can be omitted.')
        },
    }
};

const patternType: IJSONSchema = {
    anyOf: [
        {
            type: 'string',
            description: nls.localizeByDefault('The name of a contributed or predefined pattern')
        },
        problemPattern,
        multiLineProblemPattern
    ],
    description: nls.localizeByDefault('A problem pattern or the name of a contributed or predefined problem pattern. Can be omitted if base is specified.')
};

const problemMatcherObject: IJSONSchema = {
    type: 'object',
    properties: {
        base: {
            type: 'string',
            enum: problemMatcherNames,
            description: nls.localizeByDefault('The name of a base problem matcher to use.')
        },
        owner: {
            type: 'string',
            description: nls.localize('theia/task/schema/problemMatcherObject/owner',
                "The owner of the problem inside Theia. Can be omitted if base is specified. Defaults to 'external' if omitted and base is not specified.")
        },
        source: {
            type: 'string',
            description: nls.localizeByDefault("A human-readable string describing the source of this diagnostic, e.g. 'typescript' or 'super lint'.")
        },
        severity: {
            type: 'string',
            enum: ['error', 'warning', 'info'],
            description: nls.localizeByDefault("The default severity for captures problems. Is used if the pattern doesn't define a match group for severity.")
        },
        applyTo: {
            type: 'string',
            enum: ['allDocuments', 'openDocuments', 'closedDocuments'],
            description: nls.localizeByDefault('Controls if a problem reported on a text document is applied only to open, closed or all documents.')
        },
        pattern: patternType,
        fileLocation: {
            oneOf: [
                {
                    type: 'string',
                    enum: ['absolute', 'relative', 'autoDetect']
                },
                {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                }
            ],
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Defines how file names reported in a problem pattern should be interpreted. A relative fileLocation may be an array, where the second element of the array is the path of the relative file location. The search fileLocation mode, performs a deep (and, possibly, heavy) file system search within the directories specified by the include/exclude properties of the second element (or the current workspace directory if not specified).')
        },
        background: {
            type: 'object',
            additionalProperties: false,
            description: nls.localizeByDefault('Patterns to track the begin and end of a matcher active on a background task.'),
            properties: {
                activeOnStart: {
                    type: 'boolean',
                    description: nls.localizeByDefault(
                        'If set to true the background monitor starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.')
                },
                beginsPattern: {
                    oneOf: [
                        {
                            type: 'string'
                        },
                        watchingPattern
                    ],
                    description: nls.localizeByDefault('If matched in the output the start of a background task is signaled.')
                },
                endsPattern: {
                    oneOf: [
                        {
                            type: 'string'
                        },
                        watchingPattern
                    ],
                    description: nls.localizeByDefault('If matched in the output the end of a background task is signaled.')
                }
            }
        },
        watching: {
            type: 'object',
            additionalProperties: false,
            deprecationMessage: nls.localizeByDefault('The watching property is deprecated. Use background instead.'),
            description: nls.localizeByDefault('Patterns to track the begin and end of a watching matcher.'),
            properties: {
                activeOnStart: {
                    type: 'boolean',
                    description: nls.localizeByDefault(
                        'If set to true the watcher starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.')
                },
                beginsPattern: {
                    oneOf: [
                        {
                            type: 'string'
                        },
                        watchingPattern
                    ],
                    description: nls.localizeByDefault('If matched in the output the start of a watching task is signaled.')
                },
                endsPattern: {
                    oneOf: [
                        {
                            type: 'string'
                        },
                        watchingPattern
                    ],
                    description: nls.localizeByDefault('If matched in the output the end of a watching task is signaled.')
                }
            }
        }
    }
};

const problemMatcher: IJSONSchema = {
    anyOf: [
        {
            type: 'string',
            enum: problemMatcherNames
        },
        {
            type: 'array',
            items: {
                type: 'string',
                enum: problemMatcherNames
            }
        },
        problemMatcherObject,
        {
            type: 'array',
            items: problemMatcherObject
        }
    ],
    description: nls.localizeByDefault('The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
};

const presentation: IJSONSchema = {
    type: 'object',
    default: {
        echo: true,
        reveal: 'always',
        focus: false,
        panel: 'shared',
        showReuseMessage: true,
        clear: false
    },
    description: nls.localizeByDefault("Configures the panel that is used to present the task's output and reads its input."),
    additionalProperties: true,
    properties: {
        echo: {
            type: 'boolean',
            default: true,
            description: nls.localizeByDefault('Controls whether the executed command is echoed to the panel. Default is true.')
        },
        focus: {
            type: 'boolean',
            default: false,
            description: nls.localizeByDefault('Controls whether the panel takes focus. Default is false. If set to true the panel is revealed as well.')
        },
        reveal: {
            type: 'string',
            enum: ['always', 'silent', 'never'],
            enumDescriptions: [
                nls.localizeByDefault('Always reveals the terminal when this task is executed.'),
                nls.localizeByDefault('Only reveals the terminal if the task exits with an error or the problem matcher finds an error.'),
                nls.localizeByDefault('Never reveals the terminal when this task is executed.')
            ],
            default: 'always',
            description: nls.localizeByDefault(
                'Controls whether the terminal running the task is revealed or not. May be overridden by option "revealProblems". Default is "always".')
        },
        panel: {
            type: 'string',
            enum: ['shared', 'dedicated', 'new'],
            enumDescriptions: [
                nls.localize('theia/task/schema/presentation/panel/shared', 'The terminal is shared and the output of other task runs are added to the same terminal.'),
                // eslint-disable-next-line max-len
                nls.localize('theia/task/schema/presentation/panel/dedicated', 'The terminal is dedicated to a specific task. If that task is executed again, the terminal is reused. However, the output of a different task is presented in a different terminal.'),
                nls.localize('theia/task/schema/presentation/panel/new', 'Every execution of that task is using a new clean terminal.')
            ],
            default: 'shared',
            description: nls.localizeByDefault('Controls if the panel is shared between tasks, dedicated to this task or a new one is created on every run.')
        },
        showReuseMessage: {
            type: 'boolean',
            default: true,
            description: nls.localize('theia/task/schema/presentation/showReuseMessage', 'Controls whether to show the "Terminal will be reused by tasks" message.')
        },
        clear: {
            type: 'boolean',
            default: false,
            description: nls.localizeByDefault('Controls whether the terminal is cleared before executing the task.')
        }
    }
};

const detail: IJSONSchema = {
    type: 'string',
    description: nls.localizeByDefault('An optional description of a task that shows in the Run Task quick pick as a detail.')
};

const taskIdentifier: IJSONSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
        type: {
            type: 'string',
            description: nls.localizeByDefault('The task identifier.')
        }
    }
};

const processTaskConfigurationSchema: IJSONSchema = {
    type: 'object',
    required: ['type', 'label', 'command'],
    properties: {
        label: taskLabel,
        type: defaultTaskType,
        ...commandAndArgs,
        isBackground: {
            type: 'boolean',
            default: false,
            description: nls.localizeByDefault('Whether the executed task is kept alive and is running in the background.')
        },
        dependsOn: {
            anyOf: [
                {
                    type: 'string',
                    description: nls.localizeByDefault('Another task this task depends on.')
                },
                taskIdentifier,
                {
                    type: 'array',
                    description: nls.localizeByDefault('The other tasks this task depends on.'),
                    items: {
                        anyOf: [
                            {
                                type: 'string'
                            },
                            taskIdentifier
                        ]
                    }
                }
            ],
            description: nls.localizeByDefault('Either a string representing another task or an array of other tasks that this task depends on.')
        },
        dependsOrder: {
            type: 'string',
            enum: ['parallel', 'sequence'],
            enumDescriptions: [
                nls.localizeByDefault('Run all dependsOn tasks in parallel.'),
                nls.localizeByDefault('Run all dependsOn tasks in sequence.')
            ],
            default: 'parallel',
            description: nls.localizeByDefault('Determines the order of the dependsOn tasks for this task. Note that this property is not recursive.')
        },
        windows: {
            type: 'object',
            description: nls.localizeByDefault('Windows specific command configuration'),
            properties: commandAndArgs
        },
        osx: {
            type: 'object',
            description: nls.localizeByDefault('Mac specific command configuration'),
            properties: commandAndArgs
        },
        linux: {
            type: 'object',
            description: nls.localizeByDefault('Linux specific command configuration'),
            properties: commandAndArgs
        },
        group,
        problemMatcher,
        presentation,
        detail,
    },
    additionalProperties: true
};

const customizedDetectedTasks: IJSONSchema[] = [];
const customSchemas: IJSONSchema[] = [];

const taskConfigurationSchema: IJSONSchema = {
    $id: taskSchemaId,
    anyOf: [processTaskConfigurationSchema, ...customizedDetectedTasks, ...customSchemas]
};
