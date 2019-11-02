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

import debounce = require('p-debounce');
import { inject, injectable, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { PreferenceService, PreferenceScope } from '@theia/core/lib/browser';
import { QuickPickService } from '@theia/core/lib/common/quick-pick-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { TaskConfigurationModel } from './task-configuration-model';
import { TaskTemplateSelector } from './task-templates';
import { TaskCustomization, TaskConfiguration } from '../common/task-protocol';
import { WorkspaceVariableContribution } from '@theia/workspace/lib/browser/workspace-variable-contribution';
import { FileSystem, FileSystemError /*, FileStat */ } from '@theia/filesystem/lib/common';
import { FileChange, FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';

@injectable()
export class TaskConfigurationManager {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;

    @inject(FileSystem)
    protected readonly filesystem: FileSystem;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    @inject(WorkspaceVariableContribution)
    protected readonly workspaceVariables: WorkspaceVariableContribution;

    @inject(TaskTemplateSelector)
    protected readonly taskTemplateSelector: TaskTemplateSelector;

    protected readonly onDidChangeTaskConfigEmitter = new Emitter<FileChange>();
    readonly onDidChangeTaskConfig: Event<FileChange> = this.onDidChangeTaskConfigEmitter.event;

    @postConstruct()
    protected async init(): Promise<void> {
        this.updateModels();
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'tasks') {
                this.updateModels();
            }
        });
        this.workspaceService.onWorkspaceChanged(() => {
            this.updateModels();
        });
    }

    protected readonly models = new Map<string, TaskConfigurationModel>();
    protected updateModels = debounce(async () => {
        const roots = await this.workspaceService.roots;
        const toDelete = new Set(this.models.keys());
        for (const rootStat of roots) {
            const key = rootStat.uri;
            toDelete.delete(key);
            if (!this.models.has(key)) {
                const model = new TaskConfigurationModel(key, this.preferences);
                model.onDidChange(() => this.onDidChangeTaskConfigEmitter.fire({ uri: key, type: FileChangeType.UPDATED }));
                model.onDispose(() => this.models.delete(key));
                this.models.set(key, model);
                this.onDidChangeTaskConfigEmitter.fire({ uri: key, type: FileChangeType.UPDATED });
            }
        }
        for (const uri of toDelete) {
            const model = this.models.get(uri);
            if (model) {
                model.dispose();
            }
            this.onDidChangeTaskConfigEmitter.fire({ uri, type: FileChangeType.DELETED });
        }
    }, 500);

    getTasks(sourceFolderUri: string): (TaskCustomization | TaskConfiguration)[] {
        if (this.models.has(sourceFolderUri)) {
            const taskPrefModel = this.models.get(sourceFolderUri)!;
            return taskPrefModel.configurations;
        }
        return [];
    }

    getTask(name: string, sourceFolderUri: string | undefined): TaskCustomization | TaskConfiguration | undefined {
        const taskPrefModel = this.getModel(sourceFolderUri);
        if (taskPrefModel) {
            for (const configuration of taskPrefModel.configurations) {
                if (configuration.name === name) {
                    return configuration;
                }
            }
        }
    }

    async openConfiguration(sourceFolderUri: string): Promise<void> {
        const taskPrefModel = this.getModel(sourceFolderUri);
        if (taskPrefModel) {
            await this.doOpen(taskPrefModel);
        }
    }

    async addTaskConfiguration(sourceFolderUri: string, taskConfig: TaskCustomization): Promise<void> {
        const taskPrefModel = this.getModel(sourceFolderUri);
        if (taskPrefModel) {
            const configurations = taskPrefModel.configurations;
            return this.setTaskConfigurations(sourceFolderUri, [...configurations, taskConfig]);
        }
    }

    async setTaskConfigurations(sourceFolderUri: string, taskConfigs: (TaskCustomization | TaskConfiguration)[]): Promise<void> {
        const taskPrefModel = this.getModel(sourceFolderUri);
        if (taskPrefModel) {
            return taskPrefModel.setConfigurations(taskConfigs);
        }
    }

    private getModel(sourceFolderUri: string | undefined): TaskConfigurationModel | undefined {
        if (!sourceFolderUri) {
            return undefined;
        }
        for (const model of this.models.values()) {
            if (model.workspaceFolderUri === sourceFolderUri) {
                return model;
            }
        }
    }

    protected async doOpen(model: TaskConfigurationModel): Promise<EditorWidget | undefined> {
        let uri = model.uri;
        if (!uri) {
            uri = await this.doCreate(model);
        }
        if (uri) {
            return this.editorManager.open(uri, {
                mode: 'activate'
            });
        }
    }

    protected async doCreate(model: TaskConfigurationModel): Promise<URI | undefined> {
        const content = await this.getInitialConfigurationContent();
        if (content) {
            await this.preferences.set('tasks', {}, PreferenceScope.Folder, model.workspaceFolderUri); // create dummy tasks.json in the correct place
            const { configUri } = this.preferences.resolve('tasks', [], model.workspaceFolderUri); // get uri to write content to it

            let uri: URI;
            if (configUri && configUri.path.base === 'tasks.json') {
                uri = configUri;
            } else { // fallback
                uri = new URI(model.workspaceFolderUri).resolve(`${this.preferenceConfigurations.getPaths()[0]}/tasks.json`);
            }

            const fileStat = await this.filesystem.getFileStat(uri.toString());
            if (!fileStat) {
                throw new Error(`file not found: ${uri.toString()}`);
            }
            try {
                this.filesystem.setContent(fileStat, content);
            } catch (e) {
                if (!FileSystemError.FileExists.is(e)) {
                    throw e;
                }
            }
            return uri;
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
}

export namespace TaskConfigurationManager {
    export interface Data {
        current?: {
            name: string
            workspaceFolderUri?: string
        }
    }
}
