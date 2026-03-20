// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

export const COPILOT_LANGUAGE_MODELS_MANAGER_PATH = '/services/copilot/language-model-manager';
export const CopilotLanguageModelsManager = Symbol('CopilotLanguageModelsManager');

export const COPILOT_PROVIDER_ID = 'copilot';
export const COPILOT_API_BASE_URL = 'https://api.githubcopilot.com';
export const COPILOT_USER_AGENT = 'Theia-Copilot/1.0.0';

/**
 * Returns the Copilot API base URL, taking an optional GitHub Enterprise domain into account.
 */
export function getCopilotApiBaseUrl(enterpriseUrl?: string): string {
    if (enterpriseUrl) {
        const domain = enterpriseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `https://copilot-api.${domain}`;
    }
    return COPILOT_API_BASE_URL;
}

export interface CopilotModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     * Format: copilot/{modelName}
     */
    id: string;
    /**
     * The model ID as used by the Copilot API (e.g., 'gpt-4o', 'claude-3.5-sonnet').
     */
    model: string;
    /**
     * Indicate whether the streaming API shall be used.
     */
    enableStreaming: boolean;
    /**
     * Flag to configure whether the model supports structured output.
     */
    supportsStructuredOutput: boolean;
    /**
     * Maximum number of retry attempts when a request fails.
     */
    maxRetries: number;
}

export interface CopilotLanguageModelsManager {
    /**
     * Create or update language models in the registry.
     */
    createOrUpdateLanguageModels(...models: CopilotModelDescription[]): Promise<void>;
    /**
     * Remove language models from the registry.
     */
    removeLanguageModels(...modelIds: string[]): void;
    /**
     * Set the GitHub Enterprise URL for Copilot API requests.
     */
    setEnterpriseUrl(url: string | undefined): void;
    /**
     * Refresh the status of all Copilot models (e.g., after authentication state changes).
     */
    refreshModelsStatus(): Promise<void>;
    /**
     * Fetches the list of available model IDs from the Copilot API.
     * Requires authentication. Returns an empty array if not authenticated
     * or if the API call fails.
     */
    fetchAvailableModelIds(): Promise<string[]>;
}
