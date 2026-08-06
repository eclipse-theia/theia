// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { PromptFragment } from '@theia/ai-core/lib/common/prompt-service';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { PromptsAndSkillsConfigurationCategory } from './prompts-and-skills-configuration-category';

disableJSDOM();

describe('PromptsAndSkillsConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function categoryWith(skills: Skill[], slashCommands: PromptFragment[]): PromptsAndSkillsConfigurationCategory {
        const category = new PromptsAndSkillsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).skills = skills;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).slashCommands = slashCommands;
        return category;
    }

    it('declares the skills and slash commands single-page metadata', () => {
        const category = new PromptsAndSkillsConfigurationCategory();
        expect(category.id).to.equal(AiConfigurationCategoryId.PROMPTS_AND_SKILLS);
        expect(category.kind).to.equal('single-page');
    });

    it('indexes skills and slash commands for search, highlighting their rows', () => {
        const category = categoryWith(
            [{ name: 'refactor', description: 'do it', location: '/s' } as unknown as Skill],
            [{ id: 'cmd', commandName: 'go', commandDescription: 'run' } as unknown as PromptFragment]
        );
        const items = category.getSearchItems();
        const byType = (typeIncludes: string) => items.filter(i => i.typeLabel.toLowerCase().includes(typeIncludes));

        expect(byType('skill')).to.have.lengthOf(1);
        expect(byType('slash')).to.have.lengthOf(1);
        expect(items.find(i => i.label === 'refactor')?.target.highlight?.rowId).to.equal('skill:refactor');
        expect(items.find(i => i.label === '/go')?.target.highlight?.rowId).to.equal('cmd:cmd');
        expect(items.every(i => i.target.categoryId === AiConfigurationCategoryId.PROMPTS_AND_SKILLS)).to.equal(true);
    });

    it('does not list skill-backed synthetic commands as slash commands', () => {
        const category = new PromptsAndSkillsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).promptService = {
            getCommands: () => [
                { id: 'skill-command-refactor', commandName: 'refactor', isCommand: true },
                { id: 'remember', commandName: 'remember', isCommand: true }
            ] as unknown as PromptFragment[]
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).loadSlashCommands();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (category as any).slashCommands as PromptFragment[];
        expect(commands.map(command => command.id)).to.deep.equal(['remember']);
    });
});
