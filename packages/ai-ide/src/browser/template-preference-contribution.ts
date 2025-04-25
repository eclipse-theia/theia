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
import { DefaultPromptFragmentCustomizationService, PromptFragmentCustomizationProperties } from '@theia/ai-core/lib/browser/frontend-prompt-customization-service';
import {
    PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF,
    PROMPT_TEMPLATE_ADDITIONAL_EXTENSIONS_PREF,
    PROMPT_TEMPLATE_WORKSPACE_FILES_PREF
} from './workspace-preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Path } from '@theia/core';

@injectable()
export class TemplatePreferenceContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(DefaultPromptFragmentCustomizationService)
    protected readonly customizationService: DefaultPromptFragmentCustomizationService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    onStart(): void {
        Promise.all([this.preferenceService.ready, this.workspaceService.ready]).then(() => {
            // Set initial template configuration from preferences
            this.updateConfiguration();

            // Listen for preference changes
            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF ||
                    event.preferenceName === PROMPT_TEMPLATE_ADDITIONAL_EXTENSIONS_PREF ||
                    event.preferenceName === PROMPT_TEMPLATE_WORKSPACE_FILES_PREF) {
                    this.updateConfiguration(event.preferenceName);
                }
            });

            // Listen for workspace root changes
            this.workspaceService.onWorkspaceLocationChanged(() => {
                this.updateConfiguration();
            });
        });
    }

    /**
     * Updates the template configuration in the customization service.
     * If a specific preference name is provided, only that configuration aspect is updated.
     * @param changedPreference Optional name of the preference that changed
     */
    protected async updateConfiguration(changedPreference?: string): Promise<void> {
        const workspaceRoot = this.workspaceService.tryGetRoots()[0];
        if (!workspaceRoot) {
            return;
        }

        const workspaceRootUri = workspaceRoot.resource;
        const configProperties: PromptFragmentCustomizationProperties = {};

        if (!changedPreference || changedPreference === PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF) {
            const relativeDirectories = this.preferenceService.get<string[]>(PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF, []);
            configProperties.directoryPaths = relativeDirectories.map(dir => {
                const path = new Path(dir);
                const uri = workspaceRootUri.resolve(path.toString());
                return uri.path.toString();
            });
        }

        if (!changedPreference || changedPreference === PROMPT_TEMPLATE_ADDITIONAL_EXTENSIONS_PREF) {
            configProperties.extensions = this.preferenceService.get<string[]>(PROMPT_TEMPLATE_ADDITIONAL_EXTENSIONS_PREF, []);
        }

        if (!changedPreference || changedPreference === PROMPT_TEMPLATE_WORKSPACE_FILES_PREF) {
            const relativeFilePaths = this.preferenceService.get<string[]>(PROMPT_TEMPLATE_WORKSPACE_FILES_PREF, []);
            configProperties.filePaths = relativeFilePaths.map(filePath => {
                const path = new Path(filePath);
                const uri = workspaceRootUri.resolve(path.toString());
                return uri.path.toString();
            });
        }

        await this.customizationService.updateConfiguration(configProperties);
    }
}
