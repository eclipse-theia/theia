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

import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendPromptCustomizationServiceImpl } from '@theia/ai-core/lib/browser/frontend-prompt-customization-service';
import {
    PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF,
    PROMPT_TEMPLATE_WORKSPACE_EXTENSIONS_PREF,
    PROMPT_TEMPLATE_WORKSPACE_FILES_PREF
} from './workspace-preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Path } from '@theia/core';

@injectable()
export class TemplatePreferenceContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(FrontendPromptCustomizationServiceImpl)
    protected readonly customizationService: FrontendPromptCustomizationServiceImpl;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    onStart(): void {
        Promise.all([this.preferenceService.ready, this.workspaceService.ready]).then(() => {
            // Set initial template directories, extensions, and files from preferences
            this.updateTemplateDirectories();
            this.updateTemplateFileExtensions();
            this.updateTemplateFiles();

            // Listen for preference changes
            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF) {
                    this.updateTemplateDirectories();
                }
                if (event.preferenceName === PROMPT_TEMPLATE_WORKSPACE_EXTENSIONS_PREF) {
                    this.updateTemplateFileExtensions();
                }
                if (event.preferenceName === PROMPT_TEMPLATE_WORKSPACE_FILES_PREF) {
                    this.updateTemplateFiles();
                }
            });

            // Listen for workspace root changes
            this.workspaceService.onWorkspaceLocationChanged(() => {
                this.updateTemplateDirectories();
                this.updateTemplateFileExtensions();
                this.updateTemplateFiles();
            });
        });
    }

    protected async updateTemplateDirectories(): Promise<void> {
        const workspaceRoot = this.workspaceService.tryGetRoots()[0];
        if (!workspaceRoot) {
            return;
        }

        const workspaceRootUri = workspaceRoot.resource;

        // Get the workspace template directories from preferences
        const relativeDirectories = this.preferenceService.get<string[]>(PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF, []);
        // Convert relative paths to absolute paths
        const absoluteDirectories = relativeDirectories.map(dir => {
            const path = new Path(dir);
            const uri = workspaceRootUri.resolve(path.toString());
            return uri.path.toString();
        });

        // Update the template directories in the customization service
        await this.customizationService.updateTemplateDirectories(absoluteDirectories);
    }

    protected async updateTemplateFileExtensions(): Promise<void> {
        // Get the template file extensions from preferences
        const extensions = this.preferenceService.get<string[]>(PROMPT_TEMPLATE_WORKSPACE_EXTENSIONS_PREF, ['.prompttemplate']);

        // Update the template file extensions in the customization service
        await this.customizationService.updateTemplateFileExtensions(extensions);
    }

    protected async updateTemplateFiles(): Promise<void> {
        const workspaceRoot = this.workspaceService.tryGetRoots()[0];
        if (!workspaceRoot) {
            return;
        }

        const workspaceRootUri = workspaceRoot.resource;

        // Get the specific template files from preferences
        const relativeFilePaths = this.preferenceService.get<string[]>(PROMPT_TEMPLATE_WORKSPACE_FILES_PREF, []);
        // Convert relative paths to absolute paths
        const absoluteFilePaths = relativeFilePaths.map(filePath => {
            const path = new Path(filePath);
            const uri = workspaceRootUri.resolve(path.toString());
            return uri.path.toString();
        });

        // Update the template files in the customization service
        await this.customizationService.updateTemplateFiles(absoluteFilePaths);
    }
}
