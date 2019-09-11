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
import { ContributedTaskConfiguration, TaskConfiguration, TaskCustomization, TaskDefinition } from '../common';
import { TaskDefinitionRegistry } from './task-definition-registry';
import { ProvidedTaskConfigurations } from './provided-task-configurations';
import { Disposable, DisposableCollection, ResourceProvider } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { FileChange, FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { FileSystem } from '@theia/filesystem/lib/common';
import * as jsoncparser from 'jsonc-parser';
import { ParseError } from 'jsonc-parser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { open, OpenerService } from '@theia/core/lib/browser';
import { Resource } from '@theia/core';

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

    protected watchedConfigFileUris: string[] = [];
    protected watchersMap = new Map<string, Disposable>(); // map of watchers for task config files, where the key is folder uri

    /** last directory element under which we look for task config */
    protected readonly TASKFILEPATH = '.theia';
    /** task configuration file name */
    protected readonly TASKFILE = 'tasks.json';

    protected client: TaskConfigurationClient | undefined = undefined;

    /**
     * Map of source (path of root folder that the task configs come from) and raw task configurations / customizations.
     * This map is used to store the data from `tasks.json` files in workspace.
     */
    private rawTaskConfigurations = new Map<string, TaskCustomization[]>();

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(ProvidedTaskConfigurations)
    protected readonly providedTaskConfigurations: ProvidedTaskConfigurations;

    constructor(
        @inject(FileSystemWatcher) protected readonly watcherServer: FileSystemWatcher,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        this.toDispose.push(watcherServer);
        this.toDispose.push(
            this.watcherServer.onFilesChanged(async changes => {
                try {
                    const watchedConfigFileChanges = changes.filter(change =>
                        this.watchedConfigFileUris.some(fileUri => FileChangeEvent.isAffected([change], new URI(fileUri)))
                    ).map(relatedChange => (
                        { uri: relatedChange.uri.toString(), type: relatedChange.type }
                    ));
                    if (watchedConfigFileChanges.length >= 0) {
                        await this.onDidTaskFileChange(watchedConfigFileChanges);
                        if (this.client) {
                            this.client.taskConfigurationChanged(this.getTaskLabels());
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            })
        );
        this.toDispose.push(Disposable.create(() => {
            this.tasksMap.clear();
            this.taskCustomizationMap.clear();
            this.watchersMap.clear();
            this.rawTaskConfigurations.clear();
            this.client = undefined;
        }));
    }

    @postConstruct()
    protected init(): void {
        this.reorgnizeTasks();
        this.toDispose.pushAll([
            this.taskDefinitionRegistry.onDidRegisterTaskDefinition(() => this.reorgnizeTasks()),
            this.taskDefinitionRegistry.onDidUnregisterTaskDefinition(() => this.reorgnizeTasks())
        ]);
    }

    setClient(client: TaskConfigurationClient): void {
        this.client = client;
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get configFileUris(): string[] {
        return this.watchedConfigFileUris;
    }

    /**
     * Triggers the watching of a potential task configuration file, under the given root URI.
     * Returns whether a configuration file was found.
     */
    async watchConfigurationFile(rootUri: string): Promise<boolean> {
        const configFileUri = this.getConfigFileUri(rootUri);
        if (!this.watchedConfigFileUris.some(uri => uri === configFileUri)) {
            this.watchedConfigFileUris.push(configFileUri);
            const disposableWatcher = await this.watcherServer.watchFileChanges(new URI(configFileUri));
            const disposable = Disposable.create(() => {
                disposableWatcher.dispose();
                this.watchersMap.delete(configFileUri);
                const ind = this.watchedConfigFileUris.findIndex(uri => uri === configFileUri);
                if (ind >= 0) {
                    this.watchedConfigFileUris.splice(ind, 1);
                }
            });
            this.watchersMap.set(configFileUri, disposable);
            this.toDispose.push(disposable);
            this.refreshTasks(configFileUri);
        }

        if (await this.fileSystem.exists(configFileUri)) {
            return true;
        } else {
            console.info(`Config file ${this.TASKFILE} does not exist under ${rootUri}`);
            return false;
        }
    }

    /**
     * Stops watchers added to a potential task configuration file.
     * Returns whether a configuration file was being watched before this function gets called.
     */
    unwatchConfigurationFile(configFileUri: string): boolean {
        if (!this.watchersMap.has(configFileUri)) {
            return false;
        }
        this.watchersMap.get(configFileUri)!.dispose();
        return true;
    }

    /** returns the list of known task labels */
    getTaskLabels(): string[] {
        return Array.from(this.tasksMap.values()).reduce((acc, labelConfigMap) => acc.concat(Array.from(labelConfigMap.keys())), [] as string[]);
    }

    /**
     * returns the list of known tasks, which includes:
     * - all the configured tasks in `tasks.json`, and
     * - the customized detected tasks
     */
    async getTasks(): Promise<TaskConfiguration[]> {
        const configuredTasks = Array.from(this.tasksMap.values()).reduce((acc, labelConfigMap) => acc.concat(Array.from(labelConfigMap.values())), [] as TaskConfiguration[]);
        const detectedTasksAsConfigured: TaskConfiguration[] = [];
        for (const [rootFolder, customizations] of Array.from(this.taskCustomizationMap.entries())) {
            for (const cus of customizations) {
                const detected = await this.providedTaskConfigurations.getTaskToCustomize(cus, rootFolder);
                if (detected) {
                    detectedTasksAsConfigured.push(detected);
                }
            }
        }
        return [...configuredTasks, ...detectedTasksAsConfigured];
    }

    /** returns the task configuration for a given label or undefined if none */
    getTask(rootFolderPath: string, taskLabel: string): TaskConfiguration | undefined {
        const labelConfigMap = this.tasksMap.get(rootFolderPath);
        if (labelConfigMap) {
            return labelConfigMap.get(taskLabel);
        }
    }

    /** removes tasks configured in the given task config file */
    removeTasks(configFileUri: string): void {
        const source = this.getSourceFolderFromConfigUri(configFileUri);
        this.tasksMap.delete(source);
        this.taskCustomizationMap.delete(source);
    }

    /**
     * Removes task customization objects found in the given task config file from the memory.
     * Please note: this function does not modify the task config file.
     */
    removeTaskCustomizations(configFileUri: string): void {
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

        const customizationInRootFolder = this.taskCustomizationMap.get(new URI(rootFolder).path.toString());
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

    /** returns the string uri of where the config file would be, if it existed under a given root directory */
    protected getConfigFileUri(rootDir: string): string {
        return new URI(rootDir).resolve(this.TASKFILEPATH).resolve(this.TASKFILE).toString();
    }

    /**
     * Called when a change, to a config file we watch, is detected.
     * Triggers a reparse, if appropriate.
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
     * Tries to read the tasks from a config file and if it successes then updates the list of available tasks.
     * If reading a config file wasn't successful then does nothing.
     */
    protected async refreshTasks(configFileUri: string): Promise<void> {
        const tasksArray = await this.readTasks(configFileUri);
        if (tasksArray) {
            // only clear tasks map when successful at parsing the config file
            // this way we avoid clearing and re-filling it multiple times if the
            // user is editing the file in the auto-save mode, having momentarily
            // non-parsing JSON.
            this.removeTasks(configFileUri);
            this.removeTaskCustomizations(configFileUri);

            this.reorgnizeTasks();
        }
    }

    /** parses a config file and extracts the tasks launch configurations */
    protected async readTasks(uri: string): Promise<TaskConfiguration[] | undefined> {
        if (!await this.fileSystem.exists(uri)) {
            return undefined;
        } else {
            try {
                const response = await this.fileSystem.resolveContent(uri);

                const strippedContent = jsoncparser.stripComments(response.content);
                const errors: ParseError[] = [];
                const rawTasks = jsoncparser.parse(strippedContent, errors);

                if (errors.length) {
                    for (const e of errors) {
                        console.error(`Error parsing ${uri}: error: ${e.error}, length:  ${e.length}, offset:  ${e.offset}`);
                    }
                }
                const rootFolderUri = this.getSourceFolderFromConfigUri(uri);
                if (this.rawTaskConfigurations.has(rootFolderUri)) {
                    this.rawTaskConfigurations.delete(rootFolderUri);
                }
                if (rawTasks && rawTasks['tasks']) {
                    const tasks = rawTasks['tasks'].map((t: TaskCustomization | TaskConfiguration) => {
                        if (this.isDetectedTask(t)) {
                            const def = this.getTaskDefinition(t);
                            return Object.assign(t, {
                                _source: def!.source,
                                _scope: this.getSourceFolderFromConfigUri(uri)
                            });
                        }
                        return Object.assign(t, { _source: this.getSourceFolderFromConfigUri(uri) });
                    });
                    this.rawTaskConfigurations.set(rootFolderUri, tasks);
                    return tasks;
                } else {
                    return [];
                }
            } catch (err) {
                console.error(`Error(s) reading config file: ${uri}`);
            }
        }
    }

    /** Adds given task to a config file and opens the file to provide ability to edit task configuration. */
    async configure(task: TaskConfiguration): Promise<void> {
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            return;
        }

        const sourceFolderUri: string | undefined = this.getSourceFolderUriFromTask(task);
        if (!sourceFolderUri) {
            console.error('Global task cannot be customized');
            return;
        }

        const configFileUri = this.getConfigFileUri(sourceFolderUri);
        const configuredAndCustomizedTasks = await this.getTasks();
        if (!configuredAndCustomizedTasks.some(t => this.taskDefinitionRegistry.compareTasks(t, task))) {
            await this.saveTask(configFileUri, task);
        }

        try {
            await open(this.openerService, new URI(configFileUri));
        } catch (e) {
            console.error(`Error occurred while opening: ${this.TASKFILE}.`, e);
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
        const problemMatcher: string[] = [];
        if (task.problemMatcher) {
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
            } else {
                problemMatcher.push(task.problemMatcher.name!);
            }
        }
        return {
            ...customization,
            problemMatcher: problemMatcher.map(name => name.startsWith('$') ? name : `$${name}`)
        };
    }

    /** Writes the task to a config file. Creates a config file if this one does not exist */
    async saveTask(configFileUri: string, task: TaskConfiguration): Promise<void> {
        if (configFileUri && !await this.fileSystem.exists(configFileUri)) {
            await this.fileSystem.createFile(configFileUri);
        }

        const { _source, $ident, ...preparedTask } = task;
        const customizedTaskTemplate = this.getTaskCustomizationTemplate(task) || preparedTask;
        try {
            const response = await this.fileSystem.resolveContent(configFileUri);
            const content = response.content;

            const formattingOptions = { tabSize: 4, insertSpaces: true, eol: '' };
            const edits = jsoncparser.modify(content, ['tasks', -1], customizedTaskTemplate, { formattingOptions });
            const result = jsoncparser.applyEdits(content, edits);

            const resource = await this.resourceProvider(new URI(configFileUri));
            Resource.save(resource, { content: result });
        } catch (e) {
            const message = `Failed to save task configuration for ${task.label} task.`;
            console.error(`${message} ${e.toString()}`);
            return;
        }
    }

    /**
     * This function is called after a change in TaskDefinitionRegistry happens.
     * It checks all tasks that have been loaded, and re-organized them in `tasksMap` and `taskCustomizationMap`.
     */
    protected reorgnizeTasks(): void {
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
                if (this.isDetectedTask(taskConfig)) {
                    addCustomization(rootFolder, taskConfig);
                } else {
                    addConfiguredTask(rootFolder, taskConfig['label'] as string, taskConfig);
                }
            }
        }

        this.taskCustomizationMap = newTaskCustomizationMap;
        this.tasksMap = newTaskMap;
    }

    /**
     * saves the names of the problem matchers to be used to parse the output of the given task to `tasks.json`
     * @param task task that the problem matcher(s) are applied to
     * @param problemMatchers name(s) of the problem matcher(s)
     */
    async saveProblemMatcherForTask(task: TaskConfiguration, problemMatchers: string[]): Promise<void> {
        const sourceFolderUri: string | undefined = this.getSourceFolderUriFromTask(task);
        if (!sourceFolderUri) {
            console.error('Global task cannot be customized');
            return;
        }
        const configFileUri = this.getConfigFileUri(sourceFolderUri);
        const configuredAndCustomizedTasks = await this.getTasks();
        if (configuredAndCustomizedTasks.some(t => this.taskDefinitionRegistry.compareTasks(t, task))) { // task is already in `tasks.json`
            try {
                const content = (await this.fileSystem.resolveContent(configFileUri)).content;
                const errors: ParseError[] = [];
                const jsonTasks = jsoncparser.parse(content, errors).tasks;
                if (errors.length > 0) {
                    for (const e of errors) {
                        console.error(`Error parsing ${configFileUri}: error: ${e.error}, length:  ${e.length}, offset:  ${e.offset}`);
                    }
                }
                if (jsonTasks) {
                    const ind = jsonTasks.findIndex((t: TaskConfiguration) => {
                        if (t.type !== (task.taskType || task.type)) {
                            return false;
                        }
                        const def = this.taskDefinitionRegistry.getDefinition(t);
                        if (def) {
                            return def.properties.all.every(p => t[p] === task[p]);
                        }
                        return t.label === task.label;
                    });
                    const newTask = Object.assign(jsonTasks[ind], { problemMatcher: problemMatchers.map(name => name.startsWith('$') ? name : `$${name}`) });
                    jsonTasks[ind] = newTask;
                }
                const updatedTasks = JSON.stringify({ tasks: jsonTasks });
                const formattingOptions = { tabSize: 4, insertSpaces: true, eol: '' };
                const edits = jsoncparser.format(updatedTasks, undefined, formattingOptions);
                const updatedContent = jsoncparser.applyEdits(updatedTasks, edits);
                const resource = await this.resourceProvider(new URI(configFileUri));
                Resource.save(resource, { content: updatedContent });
            } catch (e) {
                console.error(`Failed to save task configuration for ${task.label} task. ${e.toString()}`);
                return;
            }
        } else { // task is not in `tasks.json`
            task.problemMatcher = problemMatchers;
            this.saveTask(configFileUri, task);
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

    private getSourceFolderUriFromTask(task: TaskConfiguration): string | undefined {
        const isDetectedTask = this.isDetectedTask(task);
        let sourceFolderUri: string | undefined;
        if (isDetectedTask) {
            sourceFolderUri = task._scope;
        } else {
            sourceFolderUri = task._source;
        }
        return sourceFolderUri;
    }
}
