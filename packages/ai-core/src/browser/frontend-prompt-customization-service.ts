// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { DisposableCollection, URI, Event, Emitter } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PromptCustomizationService, PromptTemplate, CustomAgentDescription } from '../common';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { AICorePreferences, PREFERENCE_NAME_PROMPT_TEMPLATES } from './ai-core-preferences';
import { AgentService } from '../common/agent-service';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { load, dump } from 'js-yaml';

const templateEntry = {
    id: 'my_agent',
    name: 'My Agent',
    description: 'This is an example agent. Please adapt the properties to fit your needs.',
    prompt: 'You are an example agent. Be nice and helpful to the user.',
    defaultLLM: 'openai/gpt-4o'
};

@injectable()
export class FrontendPromptCustomizationServiceImpl implements PromptCustomizationService {

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(AICorePreferences)
    protected readonly preferences: AICorePreferences;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    protected readonly trackedTemplateURIs = new Set<string>();
    protected templates = new Map<string, string>();

    protected toDispose = new DisposableCollection();

    private readonly onDidChangePromptEmitter = new Emitter<string>();
    readonly onDidChangePrompt: Event<string> = this.onDidChangePromptEmitter.event;

    private readonly onDidChangeCustomAgentsEmitter = new Emitter<void>();
    readonly onDidChangeCustomAgents = this.onDidChangeCustomAgentsEmitter.event;

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName === PREFERENCE_NAME_PROMPT_TEMPLATES) {
                this.update();
            }
        });
        this.update();
    }

    protected async update(): Promise<void> {
        this.toDispose.dispose();
        // we need to assign a local variable, so that updates running in parallel don't interfere with each other
        const _templates = new Map<string, string>();
        this.templates = _templates;
        this.trackedTemplateURIs.clear();

        const templateURI = await this.getTemplatesDirectoryURI();

        this.toDispose.push(this.fileService.watch(templateURI, { recursive: true, excludes: [] }));
        this.toDispose.push(this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {
            if (event.changes.some(change => change.resource.toString().endsWith('customAgents.yml'))) {
                this.onDidChangeCustomAgentsEmitter.fire();
            }
            // check deleted templates
            for (const deletedFile of event.getDeleted()) {
                if (this.trackedTemplateURIs.has(deletedFile.resource.toString())) {
                    this.trackedTemplateURIs.delete(deletedFile.resource.toString());
                    const templateId = this.removePromptTemplateSuffix(deletedFile.resource.path.name);
                    _templates.delete(templateId);
                    this.onDidChangePromptEmitter.fire(templateId);
                }
            }
            // check updated templates
            for (const updatedFile of event.getUpdated()) {
                if (this.trackedTemplateURIs.has(updatedFile.resource.toString())) {
                    const filecontent = await this.fileService.read(updatedFile.resource);
                    const templateId = this.removePromptTemplateSuffix(updatedFile.resource.path.name);
                    _templates.set(templateId, filecontent.value);
                    this.onDidChangePromptEmitter.fire(templateId);
                }
            }
            // check new templates
            for (const addedFile of event.getAdded()) {
                if (addedFile.resource.parent.toString() === templateURI.toString() && addedFile.resource.path.ext === '.prompttemplate') {
                    this.trackedTemplateURIs.add(addedFile.resource.toString());
                    const filecontent = await this.fileService.read(addedFile.resource);
                    const templateId = this.removePromptTemplateSuffix(addedFile.resource.path.name);
                    _templates.set(templateId, filecontent.value);
                    this.onDidChangePromptEmitter.fire(templateId);
                }
            }

        }));

        this.onDidChangeCustomAgentsEmitter.fire();
        const stat = await this.fileService.resolve(templateURI);
        if (stat.children === undefined) {
            return;
        }

        for (const file of stat.children) {
            if (!file.isFile) {
                continue;
            }
            const fileURI = file.resource;
            if (fileURI.path.ext === '.prompttemplate') {
                this.trackedTemplateURIs.add(fileURI.toString());
                const filecontent = await this.fileService.read(fileURI);
                const templateId = this.removePromptTemplateSuffix(file.name);
                _templates.set(templateId, filecontent.value);
                this.onDidChangePromptEmitter.fire(templateId);
            }
        }
    }

    protected async getTemplatesDirectoryURI(): Promise<URI> {
        const templatesFolder = this.preferences[PREFERENCE_NAME_PROMPT_TEMPLATES];
        if (templatesFolder && templatesFolder.trim().length > 0) {
            return URI.fromFilePath(templatesFolder);
        }
        const theiaConfigDir = await this.envVariablesServer.getConfigDirUri();
        return new URI(theiaConfigDir).resolve('prompt-templates');
    }

    protected async getTemplateURI(templateId: string): Promise<URI> {
        return (await this.getTemplatesDirectoryURI()).resolve(`${templateId}.prompttemplate`);
    }

    protected removePromptTemplateSuffix(filename: string): string {
        const suffix = '.prompttemplate';
        if (filename.endsWith(suffix)) {
            return filename.slice(0, -suffix.length);
        }
        return filename;
    }

    isPromptTemplateCustomized(id: string): boolean {
        return this.templates.has(id);
    }

    getCustomizedPromptTemplate(id: string): string | undefined {
        return this.templates.get(id);
    }

    async editTemplate(id: string, content?: string): Promise<void> {
        const template = this.getOriginalTemplate(id);
        if (template === undefined) {
            throw new Error(`Unable to edit template ${id}: template not found.`);
        }
        const editorUri = await this.getTemplateURI(id);
        if (! await this.fileService.exists(editorUri)) {
            await this.fileService.createFile(editorUri, BinaryBuffer.fromString(content ?? template.template));
        } else if (content) {
            // Write content to the file before opening it
            await this.fileService.writeFile(editorUri, BinaryBuffer.fromString(content));
        }
        const openHandler = await this.openerService.getOpener(editorUri);
        openHandler.open(editorUri);
    }

    async resetTemplate(id: string): Promise<void> {
        const editorUri = await this.getTemplateURI(id);
        if (await this.fileService.exists(editorUri)) {
            await this.fileService.delete(editorUri);
        }
    }

    getOriginalTemplate(id: string): PromptTemplate | undefined {
        for (const agent of this.agentService.getAllAgents()) {
            for (const template of agent.promptTemplates) {
                if (template.id === id) {
                    return template;
                }
            }
        }
        return undefined;
    }

    getTemplateIDFromURI(uri: URI): string | undefined {
        const id = this.removePromptTemplateSuffix(uri.path.name);
        if (this.templates.has(id)) {
            return id;
        }
        return undefined;
    }

    async getCustomAgents(): Promise<CustomAgentDescription[]> {
        const customAgentYamlUri = (await this.getTemplatesDirectoryURI()).resolve('customAgents.yml');
        const yamlExists = await this.fileService.exists(customAgentYamlUri);
        if (!yamlExists) {
            return [];
        }
        const filecontent = await this.fileService.read(customAgentYamlUri, { encoding: 'utf-8' });
        try {
            const doc = load(filecontent.value);
            if (!Array.isArray(doc) || !doc.every(entry => CustomAgentDescription.is(entry))) {
                console.debug('Invalid customAgents.yml file content');
                return [];
            }
            const readAgents = doc as CustomAgentDescription[];
            // make sure all agents are unique (id and name)
            const uniqueAgentIds = new Set<string>();
            const uniqueAgens: CustomAgentDescription[] = [];
            readAgents.forEach(agent => {
                if (uniqueAgentIds.has(agent.id)) {
                    return;
                }
                uniqueAgentIds.add(agent.id);
                uniqueAgens.push(agent);
            });
            return uniqueAgens;
        } catch (e) {
            console.debug(e.message, e);
            return [];
        }
    }

    async openCustomAgentYaml(): Promise<void> {
        const customAgentYamlUri = (await this.getTemplatesDirectoryURI()).resolve('customAgents.yml');
        const content = dump([templateEntry]);
        if (! await this.fileService.exists(customAgentYamlUri)) {
            await this.fileService.createFile(customAgentYamlUri, BinaryBuffer.fromString(content));
        } else {
            const fileContent = (await this.fileService.readFile(customAgentYamlUri)).value;
            await this.fileService.writeFile(customAgentYamlUri, BinaryBuffer.concat([fileContent, BinaryBuffer.fromString(content)]));
        }
        const openHandler = await this.openerService.getOpener(customAgentYamlUri);
        openHandler.open(customAgentYamlUri);
    }
}
