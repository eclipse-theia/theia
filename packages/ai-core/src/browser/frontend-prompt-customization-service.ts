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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Agent, PromptCustomizationService, PromptTemplate } from '../common';
import { PromptPreferences } from './prompt-preferences';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ContributionProvider, DisposableCollection, URI } from '@theia/core';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { OpenerService } from '@theia/core/lib/browser';

@injectable()
export class FrontendPromptCustomizationServiceImpl implements PromptCustomizationService {

    @inject(PromptPreferences)
    protected readonly preferences: PromptPreferences;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;

    protected readonly trackedTemplateURIs = new Set<string>();
    protected readonly templates = new Map<string, string>();

    protected toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName === 'ai-chat.templates-folder') {
                this.update();
            }
        });
        this.update();
    }

    protected async update(): Promise<void> {
        this.toDispose.dispose();
        this.templates.clear();
        this.trackedTemplateURIs.clear();

        const templateFolder = this.preferences['ai-chat.templates-folder'];
        if (templateFolder === undefined || templateFolder.trim().length === 0) {
            return;
        }
        const templateURI = URI.fromFilePath(templateFolder);

        this.toDispose.push(this.fileService.watch(templateURI, { recursive: true, excludes: [] }));
        this.toDispose.push(this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {

            for (const child of this.trackedTemplateURIs) {
                // check deletion and updates
                if (event.contains(new URI(child))) {
                    for (const deletedFile of event.getDeleted()) {
                        if (this.trackedTemplateURIs.has(deletedFile.resource.toString())) {
                            this.trackedTemplateURIs.delete(deletedFile.resource.toString());
                            this.templates.delete(deletedFile.resource.path.name);
                        }
                    }
                    for (const updatedFile of event.getUpdated()) {
                        if (this.trackedTemplateURIs.has(updatedFile.resource.toString())) {
                            const filecontent = await this.fileService.read(updatedFile.resource);
                            this.templates.set(this.removePromptTemplateSuffix(updatedFile.resource.path.name), filecontent.value);
                        }
                    }
                }
            }

            // check new templates
            for (const addedFile of event.getAdded()) {
                if (addedFile.resource.parent.toString() === templateURI.toString() && addedFile.resource.path.ext === '.prompttemplate') {
                    this.trackedTemplateURIs.add(addedFile.resource.toString());
                    const filecontent = await this.fileService.read(addedFile.resource);
                    this.templates.set(this.removePromptTemplateSuffix(addedFile.resource.path.name), filecontent.value);
                }
            }

        }));

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
                this.templates.set(this.removePromptTemplateSuffix(file.name), filecontent.value);
            }
        }
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
        const template = this.getTemplate(id);
        if (template === undefined) {
            throw new Error(`Unable to edit template ${id}: template not found.`);
        }
        const templatesFolder = this.preferences['ai-chat.templates-folder'];
        const editorUri = new URI(`file://${templatesFolder}/${id}.prompttemplate`);
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
        const templatesFolder = this.preferences['ai-chat.templates-folder'];
        const editorUri = new URI(`file://${templatesFolder}/${id}.prompttemplate`);
        if (await this.fileService.exists(editorUri)) {
            await this.fileService.delete(editorUri);
        }
    }

    getTemplate(id: string): PromptTemplate | undefined {
        for (const agent of this.agents.getContributions()) {
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

}
