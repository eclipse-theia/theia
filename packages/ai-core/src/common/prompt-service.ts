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
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Agent } from './agent';
import { PromptTemplate } from './types';

export interface PromptMap { [id: string]: PromptTemplate }

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
@injectable()
export class PromptServiceImpl implements PromptService {

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;

    protected _prompts: PromptMap = {};

    @postConstruct()
    public init(): void {
        this.agents.getContributions().forEach(a => {
            a.promptTemplates.forEach(template => {
                this._prompts[template.id] = template;
            });
        });
    }

    getRawPrompt(id: string): PromptTemplate | undefined {
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
        const formattedPrompt = Object.keys(args).reduce((acc, key) => acc.replace(`/\${${key}}/g`, JSON.stringify(args[key])), prompt.template);
        return formattedPrompt;
    }
    getAllPrompts(): PromptMap {
        return { ...this._prompts };
    }
    storePrompt(id: string, prompt: string): void {
        this._prompts[id] = {id, template: prompt};
    }
}
