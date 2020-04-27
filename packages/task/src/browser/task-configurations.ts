/********************************************************************************
 * Copyright (C) 2017-2018 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import {
    ContributedTaskConfiguration,
    TaskConfiguration,
    TaskCustomization,
    TaskDefinition,
    TaskOutputPresentation
} from '../common';
import { TaskDefinitionRegistry } from './task-definition-registry';
import { ProvidedTaskConfigurations } from './provided-task-configurations';
import { TaskConfigurationManager } from './task-configuration-manager';
import { TaskSchemaUpdater } from './task-schema-updater';
import { TaskSourceResolver } from './task-source-resolver';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileChange, FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { OpenerService } from '@theia/core/lib/browser';

export interface TaskConfigurationClient {
    /**
     * The task configuration file has changed, so a client might want to refresh its configurations
     * @returns an array of strings, each one being a task label
     */
    taskConfigurationChanged: (event: string[]) => void;
}

/**
 * Watches a tasks.json configuration file and provides a parsed version of the contained task configurations
 */
@injectable()
export class TaskConfigurations implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    /**
     * Map of source (path of root folder that the task configs come from) and task config map.
     * For the inner map (i.e., task config map), the key is task label and value TaskConfiguration
     */
    protected tasksMap = new Map<string, Map<string, TaskConfiguration>>();
    /**
     * Map of source (path of root folder that the task configs come from) and task customizations map.
     */
    protected taskCustomizationMap = new Map<string, TaskCustomization[]>();

    protected client: TaskConfigurationClient | undefined = undefined;

    /**
     * Map of source (path of root folder that the task configs come from) and raw task configurations / customizations.
     * This map is used to store the data from `tasks.json` files in workspace.
     */
    private rawTaskConfigurations = new Map<string, TaskCustomization[]>();

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(ProvidedTaskConfigurations)
    protected readonly providedTaskConfigurations: ProvidedTaskConfigurations;

    @inject(TaskConfigurationManager)
    protected readonly taskConfigurationManager: TaskConfigurationManager;

    @inject(TaskSchemaUpdater)
    protected readonly taskSchemaUpdater: TaskSchemaUpdater;

    @inject(TaskSourceResolver)
    protected readonly taskSourceResolver: TaskSourceResolver;

    constructor() {
        this.toDispose.push(Disposable.create(() => {
            this.tasksMap.clear();
            this.taskCustomizationMap.clear();
            this.rawTaskConfigurations.clear();
            this.client = undefined;
        }));
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(
            this.taskConfigurationManager.onDidChangeTaskConfig(async change => {
                try {
                    await this.onDidTaskFileChange([change]);
                    if (this.client) {
                        this.client.taskConfigurationChanged(this.getTaskLabels());
                    }
                } catch (err) {
                    console.error(err);
                }
            })
        );
        this.reorganizeTasks();
        this.toDispose.push(this.taskSchemaUpdater.onDidChangeTaskSchema(() => this.reorganizeTasks()));
    }

    setClient(client: TaskConfigurationClient): void {
        this.client = client;
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /** returns the list of known task labels */
    getTaskLabels(): string[] {
        return Array.from(this.tasksMap.values()).reduce((acc, labelConfigMap) => acc.concat(Array.from(labelConfigMap.keys())), [] as string[]);
    }

    /**
     * returns a collection of known tasks, which includes:
     * - all the configured tasks in `tasks.json`, and
     * - the customized detected tasks.
     *
     * The invalid task configs are not returned.
     */
    async getTasks(): Promise<TaskConfiguration[]> {
        const configuredTasks = Array.from(this.tasksMap.values()).reduce((acc, labelConfigMap) => acc.concat(Array.from(labelConfigMap.values())), [] as TaskConfiguration[]);
        const detectedTasksAsConfigured: TaskConfiguration[] = [];
        for (const [rootFolder, customizations] of Array.from(this.taskCustomizationMap.entries())) {
            for (const cus of customizations) {
                const detected = await this.providedTaskConfigurations.getTaskToCustomize(cus, rootFolder);
                if (detected) {
                    detectedTasksAsConfigured.push({ ...detected, ...cus });
                }
            }
        }
        return [...configuredTasks, ...detectedTasksAsConfigured];
    }

    getRawTaskConfigurations(rootFolder?: string): (TaskCustomization | TaskConfiguration)[] {
        if (!rootFolder) {
            const tasks: (TaskCustomization | TaskConfiguration)[] = [];
            for (const configs of this.rawTaskConfigurations.values()) {
                tasks.push(...configs);
            }
            return tasks;
        }
        if (this.rawTaskConfigurations.has(rootFolder)) {
            return Array.from(this.rawTaskConfigurations.get(rootFolder)!.values());
        }
        return [];
    }

    /**
     * returns a collection of invalid task configs as per the task schema defined in Theia.
     */
    getInvalidTaskConfigurations(): (TaskCustomization | TaskConfiguration)[] {
        const invalidTaskConfigs: (TaskCustomization | TaskConfiguration)[] = [];
        for (const taskConfigs of this.rawTaskConfigurations.values()) {
            for (const taskConfig of taskConfigs) {
                const isValid = this.isTaskConfigValid(taskConfig);
                if (!isValid) {
                    invalidTaskConfigs.push(taskConfig);
                }
            }
        }
        return invalidTaskConfigs;
    }

    /** returns the task configuration for a given label or undefined if none */
    getTask(rootFolderPath: string, taskLabel: string): TaskConfiguration | undefined {
        const labelConfigMap = this.tasksMap.get(rootFolderPath);
        if (labelConfigMap) {
            return labelConfigMap.get(taskLabel);
        }
    }

    /** returns the customized task for a given label or undefined if none */
    async getCustomizedTask(rootFolderPath: string, taskLabel: string): Promise<TaskConfiguration | undefined> {
        const customizations = this.taskCustomizationMap.get(rootFolderPath);
        if (customizations) {
            const customization = customizations.find(cus => cus.label === taskLabel);
            if (customization) {
                const detected = await this.providedTaskConfigurations.getTaskToCustomize(customization, rootFolderPath);
                if (detected) {
                    return {
                        ...detected,
                        ...customization,
                        type: detected.type
                    };
                }
            }
        }
    }

    /** removes tasks configured in the given task config file */
    private removeTasks(configFileUri: string): void {
        const source = this.getSourceFolderFromConfigUri(configFileUri);
        this.tasksMap.delete(source);
        this.taskCustomizationMap.delete(source);
    }

    /**
     * Removes task customization objects found in the given task config file from the memory.
     * Please note: this function does not modify the task config file.
     */
    private removeTaskCustomizations(configFileUri: string): void {
        const source = this.getSourceFolderFromConfigUri(configFileUri);
        this.taskCustomizationMap.delete(source);
    }

    /**
     * Returns the task customizations by type from a given root folder in the workspace.
     * @param type the type of task customizations
     * @param rootFolder the root folder to find task customizations from. If `undefined`, this function returns an empty array.
     */
    getTaskCustomizations(type: string, rootFolder?: string): TaskCustomization[] {
        if (!rootFolder) {
            return [];
        }

        const customizationInRootFolder = this.taskCustomizationMap.get(new URI(rootFolder).toString());
        if (customizationInRootFolder) {
            return customizationInRootFolder.filter(c => c.type === type);
        }
        return [];
    }

    /**
     * Returns the customization object in `tasks.json` for the given task. Please note, this function
     * returns `undefined` if the given task is not a detected task, because configured tasks don't need
     * customization objects - users can modify its config directly in `tasks.json`.
     * @param taskConfig The task config, which could either be a configured task or a detected task.
     */
    getCustomizationForTask(taskConfig: TaskConfiguration): TaskCustomization | undefined {
        if (!this.isDetectedTask(taskConfig)) {
            return undefined;
        }

        const customizationByType = this.getTaskCustomizations(taskConfig.taskType || taskConfig.type, taskConfig._scope) || [];
        const hasCustomization = customizationByType.length > 0;
        if (hasCustomization) {
            const taskDefinition = this.taskDefinitionRegistry.getDefinition(taskConfig);
            if (taskDefinition) {
                const cus = customizationByType.filter(customization =>
                    taskDefinition.properties.required.every(rp => customization[rp] === taskConfig[rp])
                )[0]; // Only support having one customization per task
                return cus;
            }
        }
        return undefined;
    }

    /**
     * Called when a change, to a config file we watch, is detected.
     */
    protected async onDidTaskFileChange(fileChanges: FileChange[]): Promise<void> {
        for (const change of fileChanges) {
            if (change.type === FileChangeType.DELETED) {
                this.removeTasks(change.uri);
            } else {
                // re-parse the config file
                await this.refreshTasks(change.uri);
            }
        }
    }

    /**
     * Read the task configs from the task configuration manager, and updates the list of available tasks.
     */
    protected async refreshTasks(rootFolderUri: string): Promise<void> {
        await this.readTasks(rootFolderUri);

        this.removeTasks(rootFolderUri);
        this.removeTaskCustomizations(rootFolderUri);

        this.reorganizeTasks();
    }

    /** parses a config file and extracts the tasks launch configurations */
    protected async readTasks(rootFolderUri: string): Promise<(TaskCustomization | TaskConfiguration)[] | undefined> {
        const rawConfigArray = this.taskConfigurationManager.getTasks(rootFolderUri);
        if (this.rawTaskConfigurations.has(rootFolderUri)) {
            this.rawTaskConfigurations.delete(rootFolderUri);
        }
        this.rawTaskConfigurations.set(rootFolderUri, rawConfigArray);
        return rawConfigArray;
    }

    /** Adds given task to a config file and opens the file to provide ability to edit task configuration. */
    async configure(task: TaskConfiguration): Promise<void> {
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            return;
        }

        const sourceFolderUri: string | undefined = this.taskSourceResolver.resolve(task);
        if (!sourceFolderUri) {
            console.error('Global task cannot be customized');
            return;
        }

        const configuredAndCustomizedTasks = await this.getTasks();
        if (!configuredAndCustomizedTasks.some(t => this.taskDefinitionRegistry.compareTasks(t, task))) {
            await this.saveTask(sourceFolderUri, { ...task, problemMatcher: [] });
        }

        try {
            await this.taskConfigurationManager.openConfiguration(sourceFolderUri);
        } catch (e) {
            console.error(`Error occurred while opening 'tasks.json' in ${sourceFolderUri}.`, e);
        }
    }

    private getTaskCustomizationTemplate(task: TaskConfiguration): TaskCustomization | undefined {
        const definition = this.getTaskDefinition(task);
        if (!definition) {
            console.error('Detected / Contributed tasks should have a task definition.');
            return;
        }
        const customization: TaskCustomization = { type: task.taskType || task.type };
        definition.properties.all.forEach(p => {
            if (task[p] !== undefined) {
                customization[p] = task[p];
            }
        });
        if ('problemMatcher' in task) {
            const problemMatcher: string[] = [];
            if (Array.isArray(task.problemMatcher)) {
                problemMatcher.push(...task.problemMatcher.map(t => {
                    if (typeof t === 'string') {
                        return t;
                    } else {
                        return t.name!;
                    }
                }));
            } else if (typeof task.problemMatcher === 'string') {
                problemMatcher.push(task.problemMatcher);
            } else if (task.problemMatcher) {
                problemMatcher.push(task.problemMatcher.name!);
            }
            customization.problemMatcher = problemMatcher.map(name => name.startsWith('$') ? name : `$${name}`);
        }
        if (task.group) {
            customization.group = task.group;
        }
        return { ...customization };
    }

    /** Writes the task to a config file. Creates a config file if this one does not exist */
    saveTask(sourceFolderUri: string, task: TaskConfiguration): Promise<void> {
        const { _source, $ident, ...preparedTask } = task;
        const customizedTaskTemplate = this.getTaskCustomizationTemplate(task) || preparedTask;
        return this.taskConfigurationManager.addTaskConfiguration(sourceFolderUri, customizedTaskTemplate);
    }

    /**
     * This function is called after a change in TaskDefinitionRegistry happens.
     * It checks all tasks that have been loaded, and re-organized them in `tasksMap` and `taskCustomizationMap`.
     */
    protected reorganizeTasks(): void {
        const newTaskMap = new Map<string, Map<string, TaskConfiguration>>();
        const newTaskCustomizationMap = new Map<string, TaskCustomization[]>();
        const addCustomization = (rootFolder: string, customization: TaskCustomization) => {
            if (newTaskCustomizationMap.has(rootFolder)) {
                newTaskCustomizationMap.get(rootFolder)!.push(customization);
            } else {
                newTaskCustomizationMap.set(rootFolder, [customization]);
            }
        };
        const addConfiguredTask = (rootFolder: string, label: string, configuredTask: TaskCustomization) => {
            if (newTaskMap.has(rootFolder)) {
                newTaskMap.get(rootFolder)!.set(label, configuredTask as TaskConfiguration);
            } else {
                const newConfigMap = new Map();
                newConfigMap.set(label, configuredTask);
                newTaskMap.set(rootFolder, newConfigMap);
            }
        };

        for (const [rootFolder, taskConfigs] of this.rawTaskConfigurations.entries()) {
            for (const taskConfig of taskConfigs) {
                const isValid = this.isTaskConfigValid(taskConfig);
                if (!isValid) {
                    continue;
                }
                const transformedTask = this.getTransformedRawTask(taskConfig, rootFolder);
                if (this.isDetectedTask(transformedTask)) {
                    addCustomization(rootFolder, transformedTask);
                } else {
                    addConfiguredTask(rootFolder, transformedTask['label'] as string, transformedTask);
                }
            }
        }

        this.taskCustomizationMap = newTaskCustomizationMap;
        this.tasksMap = newTaskMap;
    }

    private getTransformedRawTask(rawTask: TaskCustomization | TaskConfiguration, rootFolderUri: string): TaskCustomization | TaskConfiguration {
        let taskConfig: TaskCustomization | TaskConfiguration;
        if (this.isDetectedTask(rawTask)) {
            const def = this.getTaskDefinition(rawTask);
            taskConfig = {
                ...rawTask,
                _source: def!.source,
                _scope: rootFolderUri
            };
        } else {
            taskConfig = {
                ...rawTask,
                _source: rootFolderUri,
                _scope: rootFolderUri
            };
        }
        return {
            ...taskConfig,
            presentation: TaskOutputPresentation.fromJson(rawTask)
        };
    }

    /**
     * Returns `true` if the given task configuration is valid as per the task schema defined in Theia
     * or contributed by Theia extensions and plugins, `false` otherwise.
     */
    private isTaskConfigValid(task: TaskCustomization): boolean {
        return this.taskSchemaUpdater.validate({ tasks: [task] });
    }

    /**
     * Updates the task config in the `tasks.json`.
     * The task config, together with updates, will be written into the `tasks.json` if it is not found in the file.
     *
     * @param task task that the updates will be applied to
     * @param update the updates to be applied
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async updateTaskConfig(task: TaskConfiguration, update: { [name: string]: any }): Promise<void> {
        const sourceFolderUri: string | undefined = this.taskSourceResolver.resolve(task);
        if (!sourceFolderUri) {
            console.error('Global task cannot be customized');
            return;
        }
        const configuredAndCustomizedTasks = await this.getTasks();
        if (configuredAndCustomizedTasks.some(t => this.taskDefinitionRegistry.compareTasks(t, task))) { // task is already in `tasks.json`
            const jsonTasks = this.taskConfigurationManager.getTasks(sourceFolderUri);
            if (jsonTasks) {
                const ind = jsonTasks.findIndex((t: TaskCustomization | TaskConfiguration) => {
                    if (t.type !== (task.taskType || task.type)) {
                        return false;
                    }
                    const def = this.taskDefinitionRegistry.getDefinition(t);
                    if (def) {
                        return def.properties.all.every(p => t[p] === task[p]);
                    }
                    return t.label === task.label;
                });
                jsonTasks[ind] = {
                    ...jsonTasks[ind],
                    ...update
                };
            }
            this.taskConfigurationManager.setTaskConfigurations(sourceFolderUri, jsonTasks);
        } else { // task is not in `tasks.json`
            Object.keys(update).forEach(taskProperty => {
                task[taskProperty] = update[taskProperty];
            });
            this.saveTask(sourceFolderUri, task);
        }
    }

    private getSourceFolderFromConfigUri(configFileUri: string): string {
        return new URI(configFileUri).parent.parent.path.toString();
    }

    /** checks if the config is a detected / contributed task */
    private isDetectedTask(task: TaskConfiguration | TaskCustomization): task is ContributedTaskConfiguration {
        const taskDefinition = this.getTaskDefinition(task);
        // it is considered as a customization if the task definition registry finds a def for the task configuration
        return !!taskDefinition;
    }

    private getTaskDefinition(task: TaskConfiguration | TaskCustomization): TaskDefinition | undefined {
        return this.taskDefinitionRegistry.getDefinition({
            ...task,
            type: task.taskType || task.type
        });
    }
}
