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

import { URI } from '@theia/core';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { PromptTemplate } from './types';
import { AIVariableService } from './variable-service';

export interface PromptMap { [id: string]: PromptTemplate }

export const PromptService = Symbol('PromptService');
export interface PromptService {
    /**
     * Retrieve the raw {@link PromptTemplate} object.
     * @param id the id of the {@link PromptTemplate}
     */
    getRawPrompt(id: string): PromptTemplate | undefined;
    /**
     * Retrieve the default raw {@link PromptTemplate} object.
     * @param id the id of the {@link PromptTemplate}
     */
    getDefaultRawPrompt(id: string): PromptTemplate | undefined;
    /**
     * Allows to directly replace placeholders in the prompt. The supported format is 'Hi ${name}!'.
     * The placeholder is then searched inside the args object and replaced.
     * @param id the id of the prompt
     * @param args the object with placeholders, mapping the placeholder key to the value
     */
    getPrompt(id: string, args?: { [key: string]: unknown }): Promise<string | undefined>;
    /**
     * Manually add a prompt to the list of prompts.
     * @param id the id of the prompt
     * @param prompt the prompt template to store
     */
    storePrompt(id: string, prompt: string): void;
    /**
     * Return all known prompts as a {@link PromptMap map}.
     */
    getAllPrompts(): PromptMap;
}

export const PromptCustomizationService = Symbol('PromptCustomizationService');
export interface PromptCustomizationService {
    /**
     * Whether there is a customization for a {@link PromptTemplate} object
     * @param id the id of the {@link PromptTemplate} to check
     */
    isPromptTemplateCustomized(id: string): boolean;

    /**
     * Returns the customization of {@link PromptTemplate} object or undefined if there is none
     * @param id the id of the {@link PromptTemplate} to check
     */
    getCustomizedPromptTemplate(id: string): string | undefined

    /**
     * Edit the template. If the content is specified, is will be
     * used to customize the template. Otherwise, the behavior depends
     * on the implementation. Implementation may for example decide to
     * open an editor, or request more information from the user, ...
     * @param id the template id.
     * @param content optional content to customize the template.
     */
    editTemplate(id: string, content?: string): void;

    /**
     * Reset the template to its default value.
     * @param id the template id.
     */
    resetTemplate(id: string): void;

    /**
     * Return the template id for a given template file.
     * @param uri the uri of the template file
     */
    getTemplateIDFromURI(uri: URI): string | undefined;
}

// should match the one from VariableResolverService
const PROMPT_VARIABLE_REGEX = /\$\{(.*?)\}/g;

@injectable()
export class PromptServiceImpl implements PromptService {
    @inject(PromptCustomizationService) @optional()
    protected readonly customizationService: PromptCustomizationService | undefined;

    @inject(AIVariableService) @optional()
    protected readonly variableService: AIVariableService | undefined;

    protected _prompts: PromptMap = {};

    getRawPrompt(id: string): PromptTemplate | undefined {
        if (this.customizationService !== undefined && this.customizationService.isPromptTemplateCustomized(id)) {
            const template = this.customizationService.getCustomizedPromptTemplate(id);
            if (template !== undefined) {
                return { id, template };
            }
        }
        return this.getDefaultRawPrompt(id);
    }
    getDefaultRawPrompt(id: string): PromptTemplate | undefined {
        return this._prompts[id];
    }
    async getPrompt(id: string, args?: { [key: string]: unknown }): Promise<string | undefined> {
        const prompt = this.getRawPrompt(id);
        if (prompt === undefined) {
            return undefined;
        }

        const matches = [...prompt.template.matchAll(PROMPT_VARIABLE_REGEX)];
        const replacements = await Promise.all(matches.map(async match => {
            const completeText = match[0];
            const variableAndArg = match[1];
            let variableName = variableAndArg;
            let argument: string | undefined;
            const parts = variableAndArg.split(':', 2);
            if (parts.length > 1) {
                variableName = parts[0];
                argument = parts[1];
            }
            return {
                placeholder: completeText,
                value: String(args?.[variableAndArg] ?? (await this.variableService?.resolveVariable({
                    variable: variableName,
                    arg: argument
                }, {}))?.value ?? completeText)
            };
        }));
        let result = prompt.template;
        replacements.forEach(replacement => result = result.replace(replacement.placeholder, replacement.value));
        return result;
    }
    getAllPrompts(): PromptMap {
        if (this.customizationService !== undefined) {
            const myCustomization = this.customizationService;
            const result: PromptMap = {};
            Object.keys(this._prompts).forEach(id => {
                if (myCustomization.isPromptTemplateCustomized(id)) {
                    const template = myCustomization.getCustomizedPromptTemplate(id);
                    if (template !== undefined) {
                        result[id] = { id, template };
                    } else {
                        result[id] = { ...this._prompts[id] };
                    }
                } else {
                    result[id] = { ...this._prompts[id] };
                }
            });
            return result;
        } else {
            return { ...this._prompts };
        }
    }
    storePrompt(id: string, prompt: string): void {
        this._prompts[id] = { id, template: prompt };
    }
}
