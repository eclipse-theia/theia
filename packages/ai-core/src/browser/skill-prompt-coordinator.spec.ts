// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// The skill service reaches browser-side modules at import time.
const disableJSDOM = enableJSDOM();
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { CustomizedPromptFragment, PromptService } from '../common/prompt-service';
import { Skill } from '../common/skill';
import { SkillPromptCoordinator } from './skill-prompt-coordinator';
import { SkillService } from './skill-service';

after(() => disableJSDOM());

/** Records what the coordinator registers, which is all these tests are about. */
class FakePromptService {
    readonly added: CustomizedPromptFragment[] = [];
    readonly removed: string[] = [];
    addBuiltInPromptFragment(fragment: CustomizedPromptFragment): void {
        this.added.push(fragment);
    }
    removePromptFragment(id: string): void {
        this.removed.push(id);
    }
}

function skill(qualifiedName: string): Skill {
    return {
        name: qualifiedName.substring(qualifiedName.indexOf(':') + 1),
        qualifiedName,
        description: 'Does a thing.',
        location: `/plugins/x/skills/${qualifiedName}`
    };
}

function coordinator(skills: Skill[]): { instance: SkillPromptCoordinator; prompts: FakePromptService; changed: Emitter<void> } {
    const prompts = new FakePromptService();
    const changed = new Emitter<void>();
    const instance = new SkillPromptCoordinator();
    Object.assign(instance, {
        promptService: prompts as unknown as PromptService,
        skillService: {
            ready: Promise.resolve(),
            getSkills: () => skills,
            onSkillsChanged: changed.event
        } as unknown as SkillService
    });
    return { instance, prompts, changed };
}

describe('SkillPromptCoordinator', () => {

    it('keeps the colon out of the fragment id, because the id becomes a customization file name', async () => {
        // A colon is a reserved character in a Windows file name: `getTemplateURI` turns the fragment id
        // straight into one, so a customization of this fragment would either fail to write or land in
        // an alternate data stream that the directory scan never reads back.
        const { instance, prompts } = coordinator([skill('io.github.acme_tools:query-builder')]);

        await instance.onStart();

        expect(prompts.added).to.have.lengthOf(1);
        expect(prompts.added[0].id).to.equal('skill-command-io.github.acme_tools__query-builder');
        expect(prompts.added[0].id).to.not.contain(':');
    });

    it('keeps the command name qualified, so the skill is still addressed as <qualifier>:<skill>', async () => {
        const { instance, prompts } = coordinator([skill('io.github.acme_tools:query-builder')]);

        await instance.onStart();

        expect(prompts.added[0].commandName).to.equal('io.github.acme_tools:query-builder');
        expect(prompts.added[0].isCommand).to.be.true;
    });

    it('removes a skill under the same id it registered it with', async () => {
        const skills = [skill('io.github.acme_tools:query-builder')];
        const { instance, prompts, changed } = coordinator(skills);
        await instance.onStart();

        skills.length = 0;
        changed.fire();

        expect(prompts.removed).to.deep.equal(['skill-command-io.github.acme_tools__query-builder']);
    });

    it('leaves the id of an unqualified skill unchanged', async () => {
        const { instance, prompts } = coordinator([skill('deploy')]);

        await instance.onStart();

        expect(prompts.added[0].id).to.equal('skill-command-deploy');
    });
});
