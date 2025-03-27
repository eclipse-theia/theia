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
import { PromptCustomizationService, CustomAgentDescription } from '../common';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { AICorePreferences, PREFERENCE_NAME_PROMPT_TEMPLATES } from './ai-core-preferences';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { load, dump } from 'js-yaml';
import { PROMPT_TEMPLATE_EXTENSION } from './prompttemplate-contribution';

const templateEntry = {
    id: 'my_agent',
    name: 'My Agent',
    description: 'This is an example agent. Please adapt the properties to fit your needs.',
    prompt: 'You are an example agent. Be nice and helpful to the user.',
    defaultLLM: 'openai/gpt-4o'
};

// Template source priorities (higher number = higher priority)
// Higher priority will "override" lower priority templates
const enum TemplatePriority {
    GLOBAL_TEMPLATE_DIR = 1,
    ADDITIONAL_TEMPLATE_DIR = 2,
    TEMPLATE_FILE = 3
}

interface TemplateEntry {
    content: string;
    priority: number;
    sourceUri: string;
    id: string;
}

interface WatchedFileInfo {
    uri: URI;
    templateId: string;
}

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

    /** Stores URI strings of template files from directories currently being monitored for changes. */
    protected trackedTemplateURIs = new Set<string>();
    /** Contains the currently active templates, mapped by template ID. */
    protected effectiveTemplates = new Map<string, TemplateEntry>();
    /** Tracks all loaded templates, including overridden ones, mapped by source URI. */
    protected allLoadedTemplates = new Map<string, TemplateEntry>();
    /** Stores additional directory paths for loading template files. */
    protected additionalTemplateDirs = new Set<string>();
    /** Contains file extensions that identify prompt template files. */
    protected templateExtensions = new Set<string>([PROMPT_TEMPLATE_EXTENSION]);
    /** Stores specific file paths that should be treated as templates. */
    protected templateFiles = new Set<string>();
    /** Maps URI strings to WatchedFileInfo objects for individually watched template files. */
    protected watchedFiles = new Map<string, WatchedFileInfo>();
    /** Collection of disposable resources for cleanup when the service updates or is disposed. */
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
        // we need to assign local variables, so that updates running in parallel don't interfere with each other
        const templatesMap = new Map<string, TemplateEntry>();
        const trackedURIs = new Set<string>();
        const loadedTemplates = new Map<string, TemplateEntry>();
        const watchedFilesMap = new Map<string, WatchedFileInfo>();

        // Process in order of priority (lowest to highest)
        // First process the main template directory (lowest priority)
        const templateURI = await this.getTemplatesDirectoryURI();
        await this.processTemplateDirectory(templatesMap, trackedURIs, loadedTemplates, templateURI, TemplatePriority.GLOBAL_TEMPLATE_DIR);

        // Process additional template directories (medium priority)
        for (const dirPath of this.additionalTemplateDirs) {
            const dirURI = URI.fromFilePath(dirPath);
            await this.processTemplateDirectory(templatesMap, trackedURIs, loadedTemplates, dirURI, TemplatePriority.ADDITIONAL_TEMPLATE_DIR);
        }

        // Process specific template files (highest priority)
        await this.processTemplateFiles(templatesMap, trackedURIs, loadedTemplates, watchedFilesMap);

        this.effectiveTemplates = templatesMap;
        this.trackedTemplateURIs = trackedURIs;
        this.allLoadedTemplates = loadedTemplates;
        this.watchedFiles = watchedFilesMap;

        this.onDidChangeCustomAgentsEmitter.fire();
    }

    /**
     * Adds a template to the templates map, handling conflicts based on priority
     * @param templatesMap The map to add the template to
     * @param id The template ID
     * @param content The template content
     * @param priority The template priority
     * @param sourceUri The URI of the source file (used to distinguish updates from conflicts)
     * @param loadedTemplates The map to track all loaded templates
     */
    protected addTemplate(
        templatesMap: Map<string, TemplateEntry>,
        id: string,
        content: string,
        priority: number,
        sourceUri: string,
        loadedTemplates: Map<string, TemplateEntry>
    ): void {
        // Always add to loadedTemplates to keep track of all templates including overridden ones
        if (sourceUri) {
            loadedTemplates.set(sourceUri, { id, content, priority, sourceUri });
        }

        const existingEntry = templatesMap.get(id);

        if (existingEntry) {
            // If this is an update to the same file (same source URI)
            if (sourceUri && existingEntry.sourceUri === sourceUri) {
                // Update the content while keeping the same priority and source
                templatesMap.set(id, { id, content, priority, sourceUri });
                return;
            }

            // If the new template has higher priority, replace the existing one
            if (priority > existingEntry.priority) {
                templatesMap.set(id, { id, content, priority, sourceUri });
                return;
            } else if (priority === existingEntry.priority) {
                // There is a conflict with the same priority, we ignore the new template
                const conflictSourceUri = existingEntry.sourceUri ? ` (Existing source: ${existingEntry.sourceUri}, New source: ${sourceUri})` : '';
                console.warn(`Template conflict detected for ID '${id}' with equal priority.${conflictSourceUri}`);
            }
            return;
        }

        // No conflict at all, add the template
        templatesMap.set(id, { id, content, priority, sourceUri });
    }

    /**
     * Removes a template from the templates map based on the source URI and fires change event.
     * Also checks for any lower-priority templates with the same ID that might need to be loaded.
     * @param sourceUri The URI of the source file being removed
     * @param loadedTemplates The map of all loaded templates
     */
    protected removeTemplateBySourceUri(
        sourceUri: string,
        loadedTemplates: Map<string, TemplateEntry>
    ): void {
        // Get the template entry from loadedTemplates
        const removedTemplate = loadedTemplates.get(sourceUri);
        if (!removedTemplate) {
            return;
        }
        const templateId = removedTemplate.id;
        loadedTemplates.delete(sourceUri);

        // If the template is in the active templates map, we check if there is another template previously conflicting with it
        const activeTemplate = this.effectiveTemplates.get(templateId);
        if (activeTemplate && activeTemplate.sourceUri === sourceUri) {
            this.effectiveTemplates.delete(templateId);
            // Find any lower-priority templates with the same ID that were previously ignored
            const lowerPriorityTemplates = Array.from(loadedTemplates.values())
                .filter(t => t.id === templateId)
                .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)

            // If there are any lower-priority templates, add the highest priority one
            if (lowerPriorityTemplates.length > 0) {
                const highestRemainingTemplate = lowerPriorityTemplates[0];
                this.effectiveTemplates.set(templateId, highestRemainingTemplate);
            }
            this.onDidChangePromptEmitter.fire(templateId);
        }
    }

    /**
     * Process the template files specified by path, watching for changes
     * and loading their content into the templates map
     */
    protected async processTemplateFiles(
        templatesMap: Map<string, TemplateEntry>,
        trackedURIs: Set<string>,
        loadedTemplates: Map<string, TemplateEntry>,
        watchedFilesMap: Map<string, WatchedFileInfo>
    ): Promise<void> {

        for (const filePath of this.templateFiles) {
            const fileURI = URI.fromFilePath(filePath);
            const templateId = this.getTemplateIdFromFilePath(filePath);
            const uriString = fileURI.toString();

            watchedFilesMap.set(uriString, { uri: fileURI, templateId });
            this.toDispose.push(this.fileService.watch(fileURI, { recursive: false, excludes: [] }));

            if (await this.fileService.exists(fileURI)) {
                trackedURIs.add(uriString);
                const fileContent = await this.fileService.read(fileURI);
                this.addTemplate(templatesMap, templateId, fileContent.value, TemplatePriority.TEMPLATE_FILE, uriString, loadedTemplates);
            }
        }

        this.toDispose.push(this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {

            // Handle deleted files
            for (const deletedFile of event.getDeleted()) {
                const fileUriString = deletedFile.resource.toString();
                const fileInfo = this.watchedFiles.get(fileUriString);

                if (fileInfo) {
                    this.removeTemplateBySourceUri(fileUriString, loadedTemplates);
                    this.trackedTemplateURIs.delete(fileUriString);
                    this.onDidChangePromptEmitter.fire(fileInfo.templateId);
                }
            }

            // Handle updated files
            for (const updatedFile of event.getUpdated()) {
                const fileUriString = updatedFile.resource.toString();
                const fileInfo = this.watchedFiles.get(fileUriString);

                if (fileInfo) {
                    const fileContent = await this.fileService.read(fileInfo.uri);
                    this.addTemplate(
                        this.effectiveTemplates,
                        fileInfo.templateId,
                        fileContent.value,
                        TemplatePriority.TEMPLATE_FILE,
                        fileUriString,
                        loadedTemplates
                    );
                    this.onDidChangePromptEmitter.fire(fileInfo.templateId);
                }
            }

            // Handle newly created files
            for (const addedFile of event.getAdded()) {
                const fileUriString = addedFile.resource.toString();
                const fileInfo = this.watchedFiles.get(fileUriString);

                if (fileInfo) {
                    const fileContent = await this.fileService.read(fileInfo.uri);
                    this.addTemplate(
                        this.effectiveTemplates,
                        fileInfo.templateId,
                        fileContent.value,
                        TemplatePriority.TEMPLATE_FILE,
                        fileUriString,
                        loadedTemplates
                    );
                    this.trackedTemplateURIs.add(fileUriString);
                    this.onDidChangePromptEmitter.fire(fileInfo.templateId);
                }
            }
        }));
    }

    /**
     * Extract a template ID from a file path
     * @param filePath The path to the template file
     * @returns A template ID derived from the file name
     */
    protected getTemplateIdFromFilePath(filePath: string): string {
        const uri = URI.fromFilePath(filePath);
        return this.removePromptTemplateSuffix(uri.path.name);
    }

    protected async processTemplateDirectory(
        templatesMap: Map<string, TemplateEntry>,
        trackedURIs: Set<string>,
        loadedTemplates: Map<string, TemplateEntry>,
        dirURI: URI,
        priority: TemplatePriority
    ): Promise<void> {
        this.toDispose.push(this.fileService.watch(dirURI, { recursive: true, excludes: [] }));
        this.toDispose.push(this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {
            if (event.changes.some(change => change.resource.toString().endsWith('customAgents.yml'))) {
                this.onDidChangeCustomAgentsEmitter.fire();
            }

            // check deleted templates
            for (const deletedFile of event.getDeleted()) {
                if (this.trackedTemplateURIs.has(deletedFile.resource.toString())) {
                    this.trackedTemplateURIs.delete(deletedFile.resource.toString());
                    const templateId = this.removePromptTemplateSuffix(deletedFile.resource.path.name);
                    this.removeTemplateBySourceUri(deletedFile.resource.toString(), loadedTemplates);
                    this.onDidChangePromptEmitter.fire(templateId);
                }
            }

            // check updated templates
            for (const updatedFile of event.getUpdated()) {
                if (this.trackedTemplateURIs.has(updatedFile.resource.toString())) {
                    const fileContent = await this.fileService.read(updatedFile.resource);
                    const templateId = this.removePromptTemplateSuffix(updatedFile.resource.path.name);
                    this.addTemplate(this.effectiveTemplates, templateId, fileContent.value, priority, updatedFile.resource.toString(), loadedTemplates);
                    this.onDidChangePromptEmitter.fire(templateId);
                }
            }

            // check new templates
            for (const addedFile of event.getAdded()) {
                if (addedFile.resource.parent.toString() === dirURI.toString() &&
                    this.isPromptTemplateExtension(addedFile.resource.path.ext)) {
                    this.trackedTemplateURIs.add(addedFile.resource.toString());
                    const fileContent = await this.fileService.read(addedFile.resource);
                    const templateId = this.removePromptTemplateSuffix(addedFile.resource.path.name);
                    this.addTemplate(this.effectiveTemplates, templateId, fileContent.value, priority, addedFile.resource.toString(), loadedTemplates);
                    this.onDidChangePromptEmitter.fire(templateId);
                }
            }
        }));

        if (!(await this.fileService.exists(dirURI))) {
            return;
        }
        const stat = await this.fileService.resolve(dirURI);
        if (stat.children === undefined) {
            return;
        }

        for (const file of stat.children) {
            if (!file.isFile) {
                continue;
            }
            const fileURI = file.resource;
            if (this.isPromptTemplateExtension(fileURI.path.ext)) {
                trackedURIs.add(fileURI.toString());
                const fileContent = await this.fileService.read(fileURI);
                const templateId = this.removePromptTemplateSuffix(file.name);
                this.addTemplate(templatesMap, templateId, fileContent.value, priority, fileURI.toString(), loadedTemplates);
                this.onDidChangePromptEmitter.fire(templateId);
            }
        }
        this.onDidChangeCustomAgentsEmitter.fire();
    }

    /**
     * Checks if the given file extension is registered as a prompt template extension
     * @param extension The file extension including the leading dot (e.g., '.prompttemplate')
     * @returns True if the extension is registered as a prompt template extension
     */
    protected isPromptTemplateExtension(extension: string): boolean {
        return this.templateExtensions.has(extension);
    }

    /**
     * Gets the list of additional template directories that are being watched.
     * @returns Array of directory paths
     */
    getAdditionalTemplateDirectories(): string[] {
        return Array.from(this.additionalTemplateDirs);
    }

    /**
     * Updates the list of template directories by replacing the current list with a new one.
     * @param directoryPaths Array of absolute paths to the directories to watch
     */
    async updateTemplateDirectories(directoryPaths: string[]): Promise<void> {
        this.additionalTemplateDirs.clear();
        for (const path of directoryPaths) {
            this.additionalTemplateDirs.add(path);
        }
        await this.update();
    }

    /**
     * Gets the list of file extensions that are considered prompt templates.
     * @returns Array of file extensions including the leading dot (e.g., '.prompttemplate')
     */
    getTemplateFileExtensions(): string[] {
        return Array.from(this.templateExtensions);
    }

    /**
     * Updates the list of file extensions considered as prompt templates.
     * @param extensions Array of file extensions including the leading dot (e.g., '.prompttemplate')
     */
    async updateTemplateFileExtensions(extensions: string[]): Promise<void> {
        this.templateExtensions.clear();
        for (const ext of extensions) {
            this.templateExtensions.add(ext);
        }
        await this.update();
    }

    /**
     * Gets the list of specific template files that are being watched.
     * @returns Array of file paths
     */
    getTemplateFiles(): string[] {
        return Array.from(this.templateFiles);
    }

    /**
     * Updates the list of specific template files by replacing the current list with a new one.
     * @param filePaths Array of absolute paths to the template files to watch
     */
    async updateTemplateFiles(filePaths: string[]): Promise<void> {
        this.templateFiles.clear();
        for (const path of filePaths) {
            this.templateFiles.add(path);
        }
        await this.update();
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
        return (await this.getTemplatesDirectoryURI()).resolve(`${templateId}${PROMPT_TEMPLATE_EXTENSION}`);
    }

    protected removePromptTemplateSuffix(filename: string): string {
        for (const ext of this.templateExtensions) {
            if (filename.endsWith(ext)) {
                return filename.slice(0, -ext.length);
            }
        }
        // If no matching extension found, try the default one
        if (filename.endsWith(PROMPT_TEMPLATE_EXTENSION)) {
            return filename.slice(0, -PROMPT_TEMPLATE_EXTENSION.length);
        }
        return filename;
    }

    isPromptTemplateCustomized(id: string): boolean {
        return this.effectiveTemplates.has(id);
    }

    getCustomizedPromptTemplate(id: string): string | undefined {
        const entry = this.effectiveTemplates.get(id);
        return entry ? entry.content : undefined;
    }

    getCustomPromptTemplateIDs(): string[] {
        return Array.from(this.effectiveTemplates.keys());
    }

    async editTemplate(id: string, defaultContent?: string): Promise<void> {
        const editorUri = await this.getTemplateURI(id);
        if (! await this.fileService.exists(editorUri)) {
            await this.fileService.createFile(editorUri, BinaryBuffer.fromString(defaultContent ?? ''));
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

    getTemplateIDFromURI(uri: URI): string | undefined {
        const id = this.removePromptTemplateSuffix(uri.path.name);
        if (this.effectiveTemplates.has(id)) {
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
        const fileContent = await this.fileService.read(customAgentYamlUri, { encoding: 'utf-8' });
        try {
            const doc = load(fileContent.value);
            if (!Array.isArray(doc) || !doc.every(entry => CustomAgentDescription.is(entry))) {
                console.debug('Invalid customAgents.yml file content');
                return [];
            }
            const readAgents = doc as CustomAgentDescription[];
            // make sure all agents are unique (id and name)
            const uniqueAgentIds = new Set<string>();
            const uniqueAgents: CustomAgentDescription[] = [];
            readAgents.forEach(agent => {
                if (uniqueAgentIds.has(agent.id)) {
                    return;
                }
                uniqueAgentIds.add(agent.id);
                uniqueAgents.push(agent);
            });
            return uniqueAgents;
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
