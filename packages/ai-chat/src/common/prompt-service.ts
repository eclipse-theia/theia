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

import { injectable } from '@theia/core/shared/inversify';

export const PromptService = Symbol('PromptService');
export interface PromptService {
    getRawPrompt(id: string): string | undefined;
    /**
     * Allows to directly replace placeholders in the prompt. The supported format is 'Hi ${name}!'.
     * The placeholder is then searched inside the args object and replaced.
     * @param id the id of the prompt
     * @param args the object with placeholders, mapping the placeholder key to the value
     */
    getPrompt(id: string, args?: { [key: string]: unknown }): string | undefined;
    storePrompt(id: string, prompt: string): void;
    getAllPrompts(): { [id: string]: string };
}
@injectable()
export class PromptServiceImpl implements PromptService {
    protected _prompts: { [id: string]: string } = {};

    getRawPrompt(id: string): string | undefined {
        return this._prompts[id];
    }
    getPrompt(id: string, args?: {[key: string]: unknown}): string | undefined {
        const prompt = this.getRawPrompt(id);
        if (prompt === undefined) {
            return prompt;
        }
        if (args === undefined) {
            return prompt;
        }
        const formattedPrompt = Object.keys(args).reduce((acc, key) => acc.replace(`/\${${key}}/g`, JSON.stringify(args[key])), prompt);
        return formattedPrompt;
    }

    storePrompt(id: string, prompt: string): void {
        this._prompts[id] = prompt;
    }
    getAllPrompts(): { [id: string]: string; } {
        return {...this._prompts};
    }
}
