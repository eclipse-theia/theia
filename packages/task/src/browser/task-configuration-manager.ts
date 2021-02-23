/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import * as jsoncparser from 'jsonc-parser';
import debounce = require('p-debounce');
import { inject, injectable, postConstruct, named } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { PreferenceScope, PreferenceProvider, PreferenceService } from '@theia/core/lib/browser';
import { QuickPickService } from '@theia/core/lib/common/quick-pick-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { TaskConfigurationModel } from './task-configuration-model';
import { TaskTemplateSelector } from './task-templates';
import { TaskCustomization, TaskConfiguration, TaskConfigurationScope, TaskScope } from '../common/task-protocol';
import { WorkspaceVariableContribution } from '@theia/workspace/lib/browser/workspace-variable-contribution';
import { FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { DisposableCollection } from '@theia/core/lib/common';
import { TaskSchemaUpdater } from './task-schema-updater';

export interface TasksChange {
    scope: TaskConfigurationScope;
    type: FileChangeType;
}
/**
 * This class connects the the "tasks" preferences sections to task system: it collects tasks preference values and
 * provides them to the task system as raw, parsed JSON.
 */
@injectable()
export class TaskConfigurationManager {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(TaskSchemaUpdater)
    protected readonly taskSchemaProvider: TaskSchemaUpdater;

    @inject(PreferenceProvider) @named(PreferenceScope.Folder)
    protected readonly folderPreferences: PreferenceProvider;

    @inject(PreferenceProvider) @named(PreferenceScope.User)
    protected readonly userPreferences: PreferenceProvider;

    @inject(PreferenceProvider) @named(PreferenceScope.Workspace)
    protected readonly workspacePreferences: PreferenceProvider;

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    @inject(WorkspaceVariableContribution)
    protected readonly workspaceVariables: WorkspaceVariableContribution;

    @inject(TaskTemplateSelector)
    protected readonly taskTemplateSelector: TaskTemplateSelector;

    protected readonly onDidChangeTaskConfigEmitter = new Emitter<TasksChange>();
    readonly onDidChangeTaskConfig: Event<TasksChange> = this.onDidChangeTaskConfigEmitter.event;

    protected readonly models = new Map<TaskConfigurationScope, TaskConfigurationModel>();
    protected workspaceDelegate: PreferenceProvider;

    @postConstruct()
    protected async init(): Promise<void> {
        this.createModels();
        this.folderPreferences.onDidPreferencesChanged(e => {
            if (e['tasks']) {
                this.updateModels();
            }
        });
        this.workspaceService.onWorkspaceChanged(() => {
            this.updateModels();
        });
    }

    protected createModels(): void {
        const userModel = new TaskConfigurationModel(TaskScope.Global, this.userPreferences);
        userModel.onDidChange(() => this.onDidChangeTaskConfigEmitter.fire({ scope: TaskScope.Global, type: FileChangeType.UPDATED }));
        this.models.set(TaskScope.Global, userModel);

        this.updateModels();
    }

    protected updateModels = debounce(async () => {
        const roots = await this.workspaceService.roots;
        const toDelete = new Set(
            [...this.models.keys()]
                .filter(key => key !== TaskScope.Global && key !== TaskScope.Workspace)
        );
        this.updateWorkspaceModel();
        for (const rootStat of roots) {
            const key = rootStat.resource.toString();
            toDelete.delete(key);
            if (!this.models.has(key)) {
                const model = new TaskConfigurationModel(key, this.folderPreferences);
                model.onDidChange(() => this.onDidChangeTaskConfigEmitter.fire({ scope: key, type: FileChangeType.UPDATED }));
                model.onDispose(() => this.models.delete(key));
                this.models.set(key, model);
                this.onDidChangeTaskConfigEmitter.fire({ scope: key, type: FileChangeType.UPDATED });
            }
        }
        for (const uri of toDelete) {
            const model = this.models.get(uri);
            if (model) {
                model.dispose();
            }
            this.onDidChangeTaskConfigEmitter.fire({ scope: uri, type: FileChangeType.DELETED });
        }
    }, 500);

    getTasks(scope: TaskConfigurationScope): (TaskCustomization | TaskConfiguration)[] {
        return this.getModel(scope)?.configurations ?? [];
    }

    getTask(name: string, scope: TaskConfigurationScope): TaskCustomization | TaskConfiguration | undefined {
        return this.getTasks(scope).find((configuration: TaskCustomization | TaskConfiguration) => configuration.name === name);
    }

    async openConfiguration(scope: TaskConfigurationScope): Promise<void> {
        const taskPrefModel = this.getModel(scope);
        const maybeURI = typeof scope === 'string' ? scope : undefined;
        const configURI = this.preferenceService.getConfigUri(this.getMatchingPreferenceScope(scope), maybeURI, 'tasks');
        if (taskPrefModel && configURI) {
            await this.doOpen(taskPrefModel, configURI);
        }
    }

    async addTaskConfiguration(scope: TaskConfigurationScope, taskConfig: TaskCustomization): Promise<boolean> {
        const taskPrefModel = this.getModel(scope);
        if (taskPrefModel) {
            const configurations = taskPrefModel.configurations;
            return this.setTaskConfigurations(scope, [...configurations, taskConfig]);
        }
        return false;
    }

    async setTaskConfigurations(scope: TaskConfigurationScope, taskConfigs: (TaskCustomization | TaskConfiguration)[]): Promise<boolean> {
        const taskPrefModel = this.getModel(scope);
        if (taskPrefModel) {
            return taskPrefModel.setConfigurations(taskConfigs);
        }
        return false;
    }

    protected getModel(scope: TaskConfigurationScope): TaskConfigurationModel | undefined {
        return this.models.get(scope);
    }

    protected async doOpen(model: TaskConfigurationModel, configURI: URI): Promise<EditorWidget | undefined> {
        if (!model.uri) {
            // The file has not yet been created.
            await this.doCreate(model, configURI);
        }
        return this.editorManager.open(configURI, {
            mode: 'activate'
        });
    }

    protected async doCreate(model: TaskConfigurationModel, configURI: URI): Promise<void> {
        const content = await this.getInitialConfigurationContent();
        if (content) {
            // All scopes but workspace.
            if (this.preferenceConfigurations.getName(configURI) === 'tasks') {
                await this.fileService.write(configURI, content);
            } else {
                let taskContent: object;
                try {
                    taskContent = jsoncparser.parse(content);
                } catch {
                    taskContent = this.taskSchemaProvider.getTaskSchema().default ?? {};
                }
                await model.preferences.setPreference('tasks', taskContent);
            }
        }
    }

    protected getMatchingPreferenceScope(scope: TaskConfigurationScope): PreferenceScope {
        switch (scope) {
            case TaskScope.Global:
                return PreferenceScope.User;
            case TaskScope.Workspace:
                return PreferenceScope.Workspace;
            default:
                return PreferenceScope.Folder;
        }
    }

    protected async getInitialConfigurationContent(): Promise<string | undefined> {
        const selected = await this.quickPick.show(this.taskTemplateSelector.selectTemplates(), {
            placeholder: 'Select a Task Template'
        });
        if (selected) {
            return selected.content;
        }
    }

    protected readonly toDisposeOnDelegateChange = new DisposableCollection();
    protected updateWorkspaceModel(): void {
        const newDelegate = this.workspaceService.saved ? this.workspacePreferences : this.folderPreferences;
        const effectiveScope = this.workspaceService.saved ? TaskScope.Workspace : this.workspaceService.tryGetRoots()[0]?.resource.toString();
        if (newDelegate !== this.workspaceDelegate) {
            this.workspaceDelegate = newDelegate;
            this.toDisposeOnDelegateChange.dispose();

            const workspaceModel = new TaskConfigurationModel(effectiveScope, newDelegate);
            this.toDisposeOnDelegateChange.push(workspaceModel);
            // If the delegate is the folder preference provider, its events will be relayed via the folder scope models.
            if (newDelegate === this.workspacePreferences) {
                this.toDisposeOnDelegateChange.push(workspaceModel.onDidChange(() => {
                    this.onDidChangeTaskConfigEmitter.fire({ scope: TaskScope.Workspace, type: FileChangeType.UPDATED });
                }));
            }
            this.models.set(TaskScope.Workspace, workspaceModel);
        }
    }
}

export namespace TaskConfigurationManager {
    export interface Data {
        current?: {
            name: string
            workspaceFolderUri?: string
        }
    }
}
