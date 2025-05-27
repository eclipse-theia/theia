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
import { PromptFragmentCustomizationService, CustomAgentDescription, CustomizedPromptFragment } from '../common';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { AICorePreferences, PREFERENCE_NAME_PROMPT_TEMPLATES } from './ai-core-preferences';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { load, dump } from 'js-yaml';
import { PROMPT_TEMPLATE_EXTENSION } from './prompttemplate-contribution';

/**
 * Default template entry for creating custom agents
 */
const newCustomAgentEntry = {
    id: 'my_agent',
    name: 'My Agent',
    description: 'This is an example agent. Please adapt the properties to fit your needs.',
    prompt: `{{!-- Note: The context section below will resolve all context elements (e.g. files) to their full content
in the system prompt. Context elements can be added by the user in the default chat view (e.g. via DnD or the "+" button).
If you want a more fine-grained, on demand resolvement of context elements, you can also resolve files to their paths only
and equip the agent with functions so that the LLM can retrieve files on demand. See the Coder Agent prompt for an example.--}}

# Role
You are an example agent. Be nice and helpful to the user.

## Current Context
Some files and other pieces of data may have been added by the user to the context of the chat. If any have, the details can be found below.
{{contextDetails}}`,
    defaultLLM: 'openai/gpt-4o'
};

export enum CustomizationSource {
    CUSTOMIZED = 1,
    FOLDER = 2,
    FILE = 3,
}

export function getCustomizationSourceString(origin: CustomizationSource): string {
    switch (origin) {
        case CustomizationSource.FILE:
            return 'Workspace Template Files';
        case CustomizationSource.FOLDER:
            return 'Workspace Template Directories';
        default:
            return 'Prompt Templates Folder';
    }
}

/**
 * Interface defining properties that can be updated in the customization service
 */
export interface PromptFragmentCustomizationProperties {
    /** Array of directory paths to load templates from */
    directoryPaths?: string[];

    /** Array of file paths to treat as templates */
    filePaths?: string[];

    /** Array of file extensions to consider as template files */
    extensions?: string[];
}

/**
 * Internal representation of a fragment entry in the customization service
 */
interface PromptFragmentCustomization {
    /** The template content */
    template: string;

    /** Source URI where this template is stored */
    sourceUri: string;

    /** Source type of the customization */
    origin: CustomizationSource;

    /** Priority level (higher values override lower ones) */
    priority: number;

    /** Fragment ID */
    id: string;

    /** Unique customization ID */
    customizationId: string;
}

/**
 * Information about a template file being watched for changes
 */
interface WatchedFileInfo {
    /** The URI of the watched file */
    uri: URI;

    /** The fragment ID associated with this file */
    fragmentId: string;

    /** The customization ID for this file */
    customizationId: string;
}

@injectable()
export class DefaultPromptFragmentCustomizationService implements PromptFragmentCustomizationService {
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

    /** Contains the currently active customization, mapped by prompt fragment ID. */
    protected activeCustomizations = new Map<string, PromptFragmentCustomization>();

    /** Tracks all loaded customizations, including overridden ones, mapped by source URI. */
    protected allCustomizations = new Map<string, PromptFragmentCustomization>();

    /** Stores additional directory paths for loading template files. */
    protected additionalTemplateDirs = new Set<string>();

    /** Contains file extensions that identify prompt template files. */
    protected templateExtensions = new Set<string>([PROMPT_TEMPLATE_EXTENSION]);

    /** Stores specific file paths, provided by the settings, that should be treated as templates. */
    protected workspaceTemplateFiles = new Set<string>();

    /** Maps URI strings to WatchedFileInfo objects for individually watched template files. */
    protected watchedFiles = new Map<string, WatchedFileInfo>();

    /** Collection of disposable resources for cleanup when the service updates or is disposed. */
    protected toDispose = new DisposableCollection();

    protected readonly onDidChangePromptFragmentCustomizationEmitter = new Emitter<string[]>();
    readonly onDidChangePromptFragmentCustomization: Event<string[]> = this.onDidChangePromptFragmentCustomizationEmitter.event;

    protected readonly onDidChangeCustomAgentsEmitter = new Emitter<void>();
    readonly onDidChangeCustomAgents: Event<void> = this.onDidChangeCustomAgentsEmitter.event;

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName === PREFERENCE_NAME_PROMPT_TEMPLATES) {
                this.update();
            }
        });
        this.update();
    }

    /**
     * Updates the service by reloading all template files and watching for changes
     */
    protected async update(): Promise<void> {
        this.toDispose.dispose();
        // we need to assign local variables, so that updates running in parallel don't interfere with each other
        const activeCustomizationsCopy = new Map<string, PromptFragmentCustomization>();
        const trackedTemplateURIsCopy = new Set<string>();
        const allCustomizationsCopy = new Map<string, PromptFragmentCustomization>();
        const watchedFilesCopy = new Map<string, WatchedFileInfo>();

        // Process in order of priority (lowest to highest)
        // First process the main templates directory (lowest priority)
        const templatesURI = await this.getTemplatesDirectoryURI();
        await this.processTemplateDirectory(
            activeCustomizationsCopy, trackedTemplateURIsCopy, allCustomizationsCopy, templatesURI, 1, CustomizationSource.CUSTOMIZED); // Priority 1 for customized fragments

        // Process additional template directories (medium priority)
        for (const dirPath of this.additionalTemplateDirs) {
            const dirURI = URI.fromFilePath(dirPath);
            await this.processTemplateDirectory(
                activeCustomizationsCopy, trackedTemplateURIsCopy, allCustomizationsCopy, dirURI, 2, CustomizationSource.FOLDER); // Priority 2 for folder fragments
        }

        // Process specific template files (highest priority)
        await this.processTemplateFiles(activeCustomizationsCopy, trackedTemplateURIsCopy, allCustomizationsCopy, watchedFilesCopy);

        this.activeCustomizations = activeCustomizationsCopy;
        this.trackedTemplateURIs = trackedTemplateURIsCopy;
        this.allCustomizations = allCustomizationsCopy;
        this.watchedFiles = watchedFilesCopy;

        this.onDidChangeCustomAgentsEmitter.fire();
    }

    /**
     * Adds a template to the customizations map, handling conflicts based on priority
     * @param activeCustomizationsCopy The map to add the customization to
     * @param id The fragment ID
     * @param template The template content
     * @param sourceUri The URI of the source file (used to distinguish updates from conflicts)
     * @param allCustomizationsCopy The map to track all loaded customizations
     * @param priority The customization priority
     * @param origin The source type of the customization
     */
    protected addTemplate(
        activeCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        id: string,
        template: string,
        sourceUri: string,
        allCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        priority: number,
        origin: CustomizationSource
    ): void {
        // Generate a unique customization ID based on source URI and priority
        const customizationId = this.generateCustomizationId(id, sourceUri);

        // Always add to allCustomizationsCopy to keep track of all customizations including overridden ones
        if (sourceUri) {
            allCustomizationsCopy.set(sourceUri, { id, template, sourceUri, priority, customizationId, origin });
        }

        const existingEntry = activeCustomizationsCopy.get(id);

        if (existingEntry) {
            // If this is an update to the same file (same source URI)
            if (sourceUri && existingEntry.sourceUri === sourceUri) {
                // Update the content while keeping the same priority and source
                activeCustomizationsCopy.set(id, { id, template, sourceUri, priority, customizationId, origin });
                return;
            }

            // If the new customization has higher priority, replace the existing one
            if (priority > existingEntry.priority) {
                activeCustomizationsCopy.set(id, { id, template, sourceUri, priority, customizationId, origin });
                return;
            } else if (priority === existingEntry.priority) {
                // There is a conflict with the same priority, we ignore the new customization
                const conflictSourceUri = existingEntry.sourceUri ? ` (Existing source: ${existingEntry.sourceUri}, New source: ${sourceUri})` : '';
                console.warn(`Fragment conflict detected for ID '${id}' with equal priority.${conflictSourceUri}`);
            }
            return;
        }

        // No conflict at all, add the customization
        activeCustomizationsCopy.set(id, { id, template, sourceUri, priority, customizationId, origin });
    }

    /**
     * Generates a unique customization ID based on the fragment ID, source URI, and priority
     * @param id The fragment ID
     * @param sourceUri The source URI of the template
     * @returns A unique customization ID
     */
    protected generateCustomizationId(id: string, sourceUri: string): string {
        // Create a customization ID that contains information about the source and priority
        // This ensures uniqueness across different customization sources
        const sourceHash = this.hashString(sourceUri);
        return `${id}_${sourceHash}`;
    }

    /**
     * Simple hash function to generate a short identifier from a string
     * @param str The string to hash
     * @returns A string hash
     */
    protected hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36).substring(0, 8);
    }

    /**
     * Removes a customization from customizations maps based on the source URI.
     * Also checks for any lower-priority customizations with the same ID that might need to be loaded.
     * @param sourceUri The URI of the source file being removed
     * @param allCustomizationsCopy The map of all loaded customizations
     * @param activeCustomizationsCopy The map of active customizations
     * @param trackedTemplateURIsCopy Optional set of tracked URIs to update
     * @returns The fragment ID that was removed, or undefined if no customization was found
     */
    protected removeCustomizationFromMaps(
        sourceUri: string,
        allCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        activeCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        trackedTemplateURIsCopy: Set<string>
    ): string | undefined {
        // Get the customization entry from allCustomizationsCopy
        const removedCustomization = allCustomizationsCopy.get(sourceUri);
        if (!removedCustomization) {
            return undefined;
        }
        const fragmentId = removedCustomization.id;
        allCustomizationsCopy.delete(sourceUri);
        trackedTemplateURIsCopy.delete(sourceUri);

        // If the customization is in the active customizations map, we check if there is another customization previously conflicting with it
        const activeCustomization = activeCustomizationsCopy.get(fragmentId);
        if (activeCustomization && activeCustomization.sourceUri === sourceUri) {
            activeCustomizationsCopy.delete(fragmentId);
            // Find any lower-priority customizations with the same ID that were previously ignored
            const lowerPriorityCustomizations = Array.from(allCustomizationsCopy.values())
                .filter(t => t.id === fragmentId)
                .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)

            // If there are any lower-priority customizations, add the highest priority one
            if (lowerPriorityCustomizations.length > 0) {
                const highestRemainingCustomization = lowerPriorityCustomizations[0];
                activeCustomizationsCopy.set(fragmentId, highestRemainingCustomization);
            }

        }

        return fragmentId;
    }

    /**
     * Process the template files specified by path, watching for changes
     * and loading their content into the customizations map
     * @param activeCustomizationsCopy Map to store active customizations
     * @param trackedTemplateURIsCopy Set to track URIs being monitored
     * @param allCustomizationsCopy Map to store all loaded customizations
     * @param watchedFilesCopy Map to store file watch information
     */
    protected async processTemplateFiles(
        activeCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        trackedTemplateURIsCopy: Set<string>,
        allCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        watchedFilesCopy: Map<string, WatchedFileInfo>
    ): Promise<void> {
        const priority = 3; // Highest priority for specific files

        const parsedPromptFragments = new Set<string>();

        for (const filePath of this.workspaceTemplateFiles) {
            const fileURI = URI.fromFilePath(filePath);
            const fragmentId = this.getFragmentIdFromFilePath(filePath);
            const uriString = fileURI.toString();
            const customizationId = this.generateCustomizationId(fragmentId, uriString);

            watchedFilesCopy.set(uriString, { uri: fileURI, fragmentId, customizationId });
            this.toDispose.push(this.fileService.watch(fileURI, { recursive: false, excludes: [] }));

            if (await this.fileService.exists(fileURI)) {
                trackedTemplateURIsCopy.add(uriString);
                const fileContent = await this.fileService.read(fileURI);
                this.addTemplate(activeCustomizationsCopy, fragmentId, fileContent.value, uriString, allCustomizationsCopy, priority, CustomizationSource.FILE);
                parsedPromptFragments.add(fragmentId);
            }
        }

        this.onDidChangePromptFragmentCustomizationEmitter.fire(Array.from(parsedPromptFragments));

        this.toDispose.push(this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {
            // Only watch for changes that are in the watchedFiles map
            if (!event.changes.some(change => this.watchedFiles.get(change.resource.toString()))) {
                return;
            }
            // Track changes for batched notification
            const changedFragmentIds = new Set<string>();

            // Handle deleted files
            for (const deletedFile of event.getDeleted()) {
                const fileUriString = deletedFile.resource.toString();
                const fileInfo = this.watchedFiles.get(fileUriString);

                if (fileInfo) {
                    const removedFragmentId = this.removeCustomizationFromMaps(fileUriString, allCustomizationsCopy, activeCustomizationsCopy, trackedTemplateURIsCopy);
                    if (removedFragmentId) {
                        changedFragmentIds.add(removedFragmentId);
                    }
                }
            }

            // Handle updated files
            for (const updatedFile of event.getUpdated()) {
                const fileUriString = updatedFile.resource.toString();
                const fileInfo = this.watchedFiles.get(fileUriString);

                if (fileInfo) {
                    const fileContent = await this.fileService.read(fileInfo.uri);
                    this.addTemplate(
                        this.activeCustomizations,
                        fileInfo.fragmentId,
                        fileContent.value,
                        fileUriString,
                        this.allCustomizations,
                        priority,
                        CustomizationSource.FILE
                    );
                    changedFragmentIds.add(fileInfo.fragmentId);
                }
            }

            // Handle newly created files
            for (const addedFile of event.getAdded()) {
                const fileUriString = addedFile.resource.toString();
                const fileInfo = this.watchedFiles.get(fileUriString);

                if (fileInfo) {
                    const fileContent = await this.fileService.read(fileInfo.uri);
                    this.addTemplate(
                        this.activeCustomizations,
                        fileInfo.fragmentId,
                        fileContent.value,
                        fileUriString,
                        this.allCustomizations,
                        priority,
                        CustomizationSource.FILE
                    );
                    this.trackedTemplateURIs.add(fileUriString);
                    changedFragmentIds.add(fileInfo.fragmentId);
                }
            }

            const changedFragmentIdsArray = Array.from(changedFragmentIds);
            if (changedFragmentIdsArray.length > 0) {
                this.onDidChangePromptFragmentCustomizationEmitter.fire(changedFragmentIdsArray);
            };
        }));
    }

    /**
     * Extract a fragment ID from a file path
     * @param filePath The path to the template file
     * @returns A fragment ID derived from the file name
     */
    protected getFragmentIdFromFilePath(filePath: string): string {
        const uri = URI.fromFilePath(filePath);
        return this.removePromptTemplateSuffix(uri.path.name);
    }

    /**
     * Processes a directory for template files, adding them to the customizations map
     * and setting up file watching
     * @param activeCustomizationsCopy Map to store active customizations
     * @param trackedTemplateURIsCopy Set to track URIs being monitored
     * @param allCustomizationsCopy Map to store all loaded customizations
     * @param dirURI URI of the directory to process
     * @param priority Priority level for customizations in this directory
     * @param customizationSource Source type of the customization
     */
    protected async processTemplateDirectory(
        activeCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        trackedTemplateURIsCopy: Set<string>,
        allCustomizationsCopy: Map<string, PromptFragmentCustomization>,
        dirURI: URI,
        priority: number,
        customizationSource: CustomizationSource
    ): Promise<void> {
        if (!(await this.fileService.exists(dirURI))) {
            return;
        }
        const stat = await this.fileService.resolve(dirURI);
        if (stat.children === undefined) {
            return;
        }
        const parsedPromptFragments = new Set<string>();
        for (const file of stat.children) {
            if (!file.isFile) {
                continue;
            }
            const fileURI = file.resource;
            if (this.isPromptTemplateExtension(fileURI.path.ext)) {
                trackedTemplateURIsCopy.add(fileURI.toString());
                const fileContent = await this.fileService.read(fileURI);
                const fragmentId = this.removePromptTemplateSuffix(file.name);
                this.addTemplate(activeCustomizationsCopy, fragmentId, fileContent.value, fileURI.toString(), allCustomizationsCopy, priority, customizationSource);
                parsedPromptFragments.add(fragmentId);
            }
        }
        this.onDidChangePromptFragmentCustomizationEmitter.fire(Array.from(parsedPromptFragments));
        this.onDidChangeCustomAgentsEmitter.fire();

        this.toDispose.push(this.fileService.watch(dirURI, { recursive: true, excludes: [] }));
        this.toDispose.push(this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {
            // Only watch for changes within provided dir
            if (!event.changes.some(change => change.resource.toString().startsWith(dirURI.toString()))) {
                return;
            }
            if (event.changes.some(change => change.resource.toString().endsWith('customAgents.yml'))) {
                this.onDidChangeCustomAgentsEmitter.fire();
            }

            // Track changes for batched notification
            const changedFragmentIds = new Set<string>();

            // check deleted templates
            for (const deletedFile of event.getDeleted()) {
                const uriString = deletedFile.resource.toString();
                if (this.trackedTemplateURIs.has(uriString)) {
                    const removedFragmentId = this.removeCustomizationFromMaps(uriString, this.allCustomizations, this.activeCustomizations, this.trackedTemplateURIs);
                    if (removedFragmentId) {
                        changedFragmentIds.add(removedFragmentId);
                    }
                }
            }

            // check updated templates
            for (const updatedFile of event.getUpdated()) {
                const uriString = updatedFile.resource.toString();
                if (this.trackedTemplateURIs.has(uriString)) {
                    const fileContent = await this.fileService.read(updatedFile.resource);
                    const fragmentId = this.removePromptTemplateSuffix(updatedFile.resource.path.name);
                    this.addTemplate(this.activeCustomizations, fragmentId, fileContent.value, uriString, this.allCustomizations, priority, customizationSource);
                    changedFragmentIds.add(fragmentId);
                }
            }

            // check new templates
            for (const addedFile of event.getAdded()) {
                if (addedFile.resource.parent.toString() === dirURI.toString() &&
                    this.isPromptTemplateExtension(addedFile.resource.path.ext)) {
                    const uriString = addedFile.resource.toString();
                    this.trackedTemplateURIs.add(uriString);
                    const fileContent = await this.fileService.read(addedFile.resource);
                    const fragmentId = this.removePromptTemplateSuffix(addedFile.resource.path.name);
                    this.addTemplate(this.activeCustomizations, fragmentId, fileContent.value, uriString, this.allCustomizations, priority, customizationSource);
                    changedFragmentIds.add(fragmentId);
                }
            }

            const changedFragmentIdsArray = Array.from(changedFragmentIds);
            if (changedFragmentIdsArray.length > 0) {
                this.onDidChangePromptFragmentCustomizationEmitter.fire(changedFragmentIdsArray);
            };
        }));
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
     * Gets the list of file extensions that are considered prompt templates.
     * @returns Array of file extensions including the leading dot (e.g., '.prompttemplate')
     */
    getTemplateFileExtensions(): string[] {
        return Array.from(this.templateExtensions);
    }

    /**
     * Gets the list of specific template files that are being watched.
     * @returns Array of file paths
     */
    getTemplateFiles(): string[] {
        return Array.from(this.workspaceTemplateFiles);
    }

    /**
     * Updates multiple configuration properties at once, triggering only a single update process.
     * @param properties An object containing the properties to update
     * @returns Promise that resolves when the update is complete
     */
    async updateConfiguration(properties: PromptFragmentCustomizationProperties): Promise<void> {
        if (properties.directoryPaths !== undefined) {
            this.additionalTemplateDirs.clear();
            for (const path of properties.directoryPaths) {
                this.additionalTemplateDirs.add(path);
            }
        }

        if (properties.extensions !== undefined) {
            this.templateExtensions.clear();
            for (const ext of properties.extensions) {
                this.templateExtensions.add(ext);
            }
            // Always include the default PROMPT_TEMPLATE_EXTENSION
            this.templateExtensions.add(PROMPT_TEMPLATE_EXTENSION);
        }

        if (properties.filePaths !== undefined) {
            this.workspaceTemplateFiles.clear();
            for (const path of properties.filePaths) {
                this.workspaceTemplateFiles.add(path);
            }
        }

        // Only run the update process once, no matter how many properties were changed
        await this.update();
    }

    /**
     * Gets the URI of the templates directory
     * @returns URI of the templates directory
     */
    protected async getTemplatesDirectoryURI(): Promise<URI> {
        const templatesFolder = this.preferences[PREFERENCE_NAME_PROMPT_TEMPLATES];
        if (templatesFolder && templatesFolder.trim().length > 0) {
            return URI.fromFilePath(templatesFolder);
        }
        const theiaConfigDir = await this.envVariablesServer.getConfigDirUri();
        return new URI(theiaConfigDir).resolve('prompt-templates');
    }

    /**
     * Gets the URI for a specific template file
     * @param fragmentId The fragment ID
     * @returns URI for the template file
     */
    protected async getTemplateURI(fragmentId: string): Promise<URI> {
        return (await this.getTemplatesDirectoryURI()).resolve(`${fragmentId}${PROMPT_TEMPLATE_EXTENSION}`);
    }

    /**
     * Removes the prompt template extension from a filename
     * @param filename The filename with extension
     * @returns The filename without the extension
     */
    protected removePromptTemplateSuffix(filename: string): string {
        for (const ext of this.templateExtensions) {
            if (filename.endsWith(ext)) {
                return filename.slice(0, -ext.length);
            }
        }
        return filename;
    }

    // PromptFragmentCustomizationService interface implementation

    isPromptFragmentCustomized(id: string): boolean {
        return this.activeCustomizations.has(id);
    }

    getActivePromptFragmentCustomization(id: string): CustomizedPromptFragment | undefined {
        const entry = this.activeCustomizations.get(id);
        if (!entry) {
            return undefined;
        }

        return {
            id: entry.id,
            template: entry.template,
            customizationId: entry.customizationId,
            priority: entry.priority
        };
    }

    getAllCustomizations(id: string): CustomizedPromptFragment[] {
        const fragments: CustomizedPromptFragment[] = [];

        // Collect all customizations with matching ID
        this.allCustomizations.forEach(value => {
            if (value.id === id) {
                fragments.push({
                    id: value.id,
                    template: value.template,
                    customizationId: value.customizationId,
                    priority: value.priority
                });
            }
        });

        // Sort by priority (highest first)
        return fragments.sort((a, b) => b.priority - a.priority);
    }

    getCustomizedPromptFragmentIds(): string[] {
        return Array.from(this.activeCustomizations.keys());
    }

    async createPromptFragmentCustomization(id: string, defaultContent?: string): Promise<void> {
        await this.editTemplate(id, defaultContent);
    }

    async createBuiltInPromptFragmentCustomization(id: string, defaultContent?: string): Promise<void> {
        await this.createPromptFragmentCustomization(id, defaultContent);
    }

    async editPromptFragmentCustomization(id: string, customizationId: string): Promise<void> {
        // Find the customization with the given customization ID
        const customization = Array.from(this.allCustomizations.values()).find(t =>
            t.id === id && t.customizationId === customizationId
        );

        if (customization) {
            const uri = new URI(customization.sourceUri);
            const openHandler = await this.openerService.getOpener(uri);
            openHandler.open(uri);
        } else {
            // Fall back to editing by fragment ID if customization ID not found
            await this.editTemplate(id);
        }
    }

    /**
     * Edits a template by opening it in the editor, creating it if it doesn't exist
     * @param id The fragment ID
     * @param defaultContent Optional default content for new templates
     */
    protected async editTemplate(id: string, defaultContent?: string): Promise<void> {
        const editorUri = await this.getTemplateURI(id);
        if (!(await this.fileService.exists(editorUri))) {
            await this.fileService.createFile(editorUri, BinaryBuffer.fromString(defaultContent ?? ''));
        }
        const openHandler = await this.openerService.getOpener(editorUri);
        openHandler.open(editorUri);
    }

    async removePromptFragmentCustomization(id: string, customizationId: string): Promise<void> {
        // Find the customization with the given customization ID
        const customization = Array.from(this.allCustomizations.values()).find(t =>
            t.id === id && t.customizationId === customizationId
        );

        if (customization) {
            const sourceUri = customization.sourceUri;

            // Delete the file if it exists
            const uri = new URI(sourceUri);
            if (await this.fileService.exists(uri)) {
                await this.fileService.delete(uri);
            }
        }
    }

    async removeAllPromptFragmentCustomizations(id: string): Promise<void> {
        // Get all customizations for this fragment ID
        const customizations = this.getAllCustomizations(id);

        if (customizations.length === 0) {
            return; // Nothing to reset
        }

        // Find and delete all customization files
        for (const customization of customizations) {
            const fragment = Array.from(this.allCustomizations.values()).find(t =>
                t.id === id && t.customizationId === customization.customizationId
            );

            if (fragment) {
                const sourceUri = fragment.sourceUri;
                // Delete the file if it exists
                const uri = new URI(sourceUri);
                if (await this.fileService.exists(uri)) {
                    await this.fileService.delete(uri);
                }
            }
        }
    }

    async resetToCustomization(id: string, customizationId: string): Promise<void> {
        const customization = Array.from(this.allCustomizations.values()).find(t =>
            t.id === id && t.customizationId === customizationId
        );

        if (customization) {
            // Get all customizations for this fragment ID
            const customizations = this.getAllCustomizations(id);

            if (customizations.length === 0) {
                return; // Nothing to reset
            }

            // Find the target customization
            const targetCustomization = customizations.find(c => c.customizationId === customizationId);
            if (!targetCustomization) {
                return; // Target customization not found
            }

            // Find and delete all higher-priority customization files
            for (const cust of customizations) {
                if (cust.priority > targetCustomization.priority) {
                    const fragmentToDelete = Array.from(this.allCustomizations.values()).find(t =>
                        t.id === cust.id && t.customizationId === cust.customizationId
                    );
                    if (fragmentToDelete) {
                        const sourceUri = fragmentToDelete.sourceUri;

                        // Delete the file if it exists
                        const uri = new URI(sourceUri);
                        if (await this.fileService.exists(uri)) {
                            await this.fileService.delete(uri);
                        }
                    }
                }
            }
        }
    }

    async getPromptFragmentCustomizationDescription(id: string, customizationId: string): Promise<string | undefined> {
        // Find the customization with the given customization ID
        const customization = Array.from(this.allCustomizations.values()).find(t =>
            t.id === id && t.customizationId === customizationId
        );

        if (customization) {
            return customization.sourceUri;
        }

        return undefined;
    }

    async getPromptFragmentCustomizationType(id: string, customizationId: string): Promise<string | undefined> {
        // Find the customization with the given customization ID
        const customization = Array.from(this.allCustomizations.values()).find(t =>
            t.id === id && t.customizationId === customizationId
        );

        if (customization) {
            return getCustomizationSourceString(customization.origin);
        }

        return undefined;
    }

    async editBuiltIn(id: string, defaultContent = ''): Promise<void> {
        // Find an existing built-in customization (those with priority 1)
        const builtInCustomization = Array.from(this.allCustomizations.values()).find(t =>
            t.id === id && t.priority === 1
        );

        if (builtInCustomization) {
            // Edit the existing built-in customization
            const uri = new URI(builtInCustomization.sourceUri);
            const openHandler = await this.openerService.getOpener(uri);
            openHandler.open(uri);
        } else {
            // Create a new built-in customization
            // Get the template URI in the main templates directory (priority 1)
            const templateUri = await this.getTemplateURI(id);

            // If template doesn't exist, create it with default content
            if (!(await this.fileService.exists(templateUri))) {
                await this.fileService.createFile(templateUri, BinaryBuffer.fromString(defaultContent));
            }

            // Open the template in the editor
            const openHandler = await this.openerService.getOpener(templateUri);
            openHandler.open(templateUri);
        }
    }

    async resetBuiltInCustomization(id: string): Promise<void> {
        // Find a built-in customization (those with priority 1)
        const builtInCustomization = Array.from(this.allCustomizations.values()).find(t =>
            t.id === id && t.priority === 1
        );

        if (!builtInCustomization) {
            return; // No built-in customization found
        }

        const sourceUri = builtInCustomization.sourceUri;

        // Delete the file if it exists
        const uri = new URI(sourceUri);
        if (await this.fileService.exists(uri)) {
            await this.fileService.delete(uri);
        }
    }

    async editBuiltInPromptFragmentCustomization(id: string, defaultContent?: string): Promise<void> {
        return this.editBuiltIn(id, defaultContent);
    }

    /**
     * Gets the fragment ID from a URI
     * @param uri URI to check
     * @returns Fragment ID or undefined if not found
     */
    protected getFragmentIDFromURI(uri: URI): string | undefined {
        const id = this.removePromptTemplateSuffix(uri.path.name);
        if (this.activeCustomizations.has(id)) {
            return id;
        }
        return undefined;
    }

    /**
     * Implementation of the generic getPromptFragmentIDFromResource method in the interface
     * Accepts any resource identifier but only processes URIs
     * @param resourceId Resource to check
     * @returns Fragment ID or undefined if not found
     */
    getPromptFragmentIDFromResource(resourceId: unknown): string | undefined {
        // Check if the resource is a URI
        if (resourceId instanceof URI) {
            return this.getFragmentIDFromURI(resourceId);
        }
        return undefined;
    }

    async getCustomAgents(): Promise<CustomAgentDescription[]> {
        const agentsById = new Map<string, CustomAgentDescription>();
        // First, process additional (workspace) template directories to give them precedence
        for (const dirPath of this.additionalTemplateDirs) {
            const dirURI = URI.fromFilePath(dirPath);
            await this.loadCustomAgentsFromDirectory(dirURI, agentsById);
        }
        // Then process global templates directory (only adding agents that don't conflict)
        const globalTemplatesDir = await this.getTemplatesDirectoryURI();
        await this.loadCustomAgentsFromDirectory(globalTemplatesDir, agentsById);
        // Return the merged list of agents
        return Array.from(agentsById.values());
    }

    /**
     * Load custom agents from a specific directory
     * @param directoryURI The URI of the directory to load from
     * @param agentsById Map to store the loaded agents by ID
     */
    protected async loadCustomAgentsFromDirectory(
        directoryURI: URI,
        agentsById: Map<string, CustomAgentDescription>
    ): Promise<void> {
        const customAgentYamlUri = directoryURI.resolve('customAgents.yml');
        const yamlExists = await this.fileService.exists(customAgentYamlUri);
        if (!yamlExists) {
            return;
        }

        try {
            const fileContent = await this.fileService.read(customAgentYamlUri, { encoding: 'utf-8' });
            const doc = load(fileContent.value);

            if (!Array.isArray(doc) || !doc.every(entry => CustomAgentDescription.is(entry))) {
                console.debug(`Invalid customAgents.yml file content in ${directoryURI.toString()}`);
                return;
            }

            const readAgents = doc as CustomAgentDescription[];

            // Add agents to the map if they don't already exist
            for (const agent of readAgents) {
                if (!agentsById.has(agent.id)) {
                    agentsById.set(agent.id, agent);
                }
            }
        } catch (e) {
            console.debug(`Error loading customAgents.yml from ${directoryURI.toString()}: ${e.message}`, e);
        }
    }

    /**
     * Returns all locations of existing customAgents.yml files and potential locations where
     * new customAgents.yml files could be created.
     *
     * @returns An array of objects containing the URI and whether the file exists
     */
    async getCustomAgentsLocations(): Promise<{ uri: URI, exists: boolean }[]> {
        const locations: { uri: URI, exists: boolean }[] = [];
        // Check global templates directory
        const globalTemplatesDir = await this.getTemplatesDirectoryURI();
        const globalAgentsUri = globalTemplatesDir.resolve('customAgents.yml');
        const globalExists = await this.fileService.exists(globalAgentsUri);
        locations.push({ uri: globalAgentsUri, exists: globalExists });
        // Check additional (workspace) template directories
        for (const dirPath of this.additionalTemplateDirs) {
            const dirURI = URI.fromFilePath(dirPath);
            const agentsUri = dirURI.resolve('customAgents.yml');
            const exists = await this.fileService.exists(agentsUri);
            locations.push({ uri: agentsUri, exists: exists });
        }
        return locations;
    }

    /**
     * Opens an existing customAgents.yml file at the given URI, or creates a new one if it doesn't exist.
     *
     * @param uri The URI of the customAgents.yml file to open or create
     */
    async openCustomAgentYaml(uri: URI): Promise<void> {
        const content = dump([newCustomAgentEntry]);
        if (! await this.fileService.exists(uri)) {
            await this.fileService.createFile(uri, BinaryBuffer.fromString(content));
        } else {
            const fileContent = (await this.fileService.readFile(uri)).value;
            await this.fileService.writeFile(uri, BinaryBuffer.concat([fileContent, BinaryBuffer.fromString(content)]));
        }
        const openHandler = await this.openerService.getOpener(uri);
        openHandler.open(uri);
    }
}
