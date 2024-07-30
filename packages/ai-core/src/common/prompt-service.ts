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

import { ContributionProvider } from '@theia/core';
import { inject, injectable, named, optional, postConstruct } from '@theia/core/shared/inversify';
import { Agent } from './agent';
import { PromptTemplate } from './types';

export interface PromptMap { [id: string]: PromptTemplate }

export const PromptCollectionService = Symbol('PromptCollectionService');
export interface PromptCollectionService {
    getAllPrompts(): PromptTemplate[];
}
@injectable()
export class PromptCollectionServiceImpl implements PromptCollectionService {

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;

    protected _prompts: PromptTemplate[] = [];

    @postConstruct()
    public init(): void {
        this.agents.getContributions().forEach(a => {
            this._prompts.push(...a.promptTemplates);
        });
    }

    getAllPrompts(): PromptTemplate[] {
        return this._prompts;
    }
}

export const PromptService = Symbol('PromptService');
export interface PromptService {
    /**
     * Retrieve the raw {@link PromptTemplate} object.
     * @param id the id of the {@link PromptTemplate}
     */
    getRawPrompt(id: string): PromptTemplate | undefined;
    /**
     * Allows to directly replace placeholders in the prompt. The supported format is 'Hi ${name}!'.
     * The placeholder is then searched inside the args object and replaced.
     * @param id the id of the prompt
     * @param args the object with placeholders, mapping the placeholder key to the value
     */
    getPrompt(id: string, args?: { [key: string]: unknown }): string | undefined;
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
}

@injectable()
export class PromptServiceImpl implements PromptService {

    @inject(PromptCollectionService)
    protected readonly promptCollectionService: PromptCollectionService;

    @inject(PromptCustomizationService) @optional()
    protected readonly customizationService: PromptCustomizationService | undefined;

    protected _prompts: PromptMap = {};

    @postConstruct()
    public init(): void {
        this.promptCollectionService.getAllPrompts().forEach(template => {
            this._prompts[template.id] = template;
        });
    }

    getRawPrompt(id: string): PromptTemplate | undefined {
        if (this.customizationService !== undefined && this.customizationService.isPromptTemplateCustomized(id)) {
            const template = this.customizationService.getCustomizedPromptTemplate(id);
            if (template !== undefined) {
                return { id, template };
            }
        }
        return this._prompts[id];
    }
    getPrompt(id: string, args?: { [key: string]: unknown }): string | undefined {
        const prompt = this.getRawPrompt(id);
        if (prompt === undefined) {
            return undefined;
        }
        if (args === undefined) {
            return prompt.template;
        }
        const formattedPrompt = Object.keys(args).reduce((acc, key) => acc.replace(`\${${key}}`, args[key] as string), prompt.template);
        return formattedPrompt;
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
