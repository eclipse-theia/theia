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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { ListSkills } from './skill-file-functions';

disableJSDOM();

describe('ListSkills', () => {
    let tool: ListSkills;

    const skill = (qualifiedName: string, description: string): Skill =>
        ({ name: qualifiedName, qualifiedName, description, location: `/skills/${qualifiedName}/SKILL.md` });

    const skills = [
        skill('pdf', 'Extract text\nand tables from PDF files.'),
        skill('coding-workflow', 'Carry out a code change: refactor, bug fix, test fix.'),
        skill('ext:ponytail', 'Minimal code for any coding task, including refactor.')
    ];

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        const container = new Container();
        container.bind(SkillService).toConstantValue({ getSkills: () => skills } as unknown as SkillService);
        container.bind(ListSkills).toSelf();
        tool = container.get(ListSkills);
    });

    const call = async (args: object | undefined): Promise<string> =>
        await tool.getTool().handler(args === undefined ? '' : JSON.stringify(args)) as string;

    it('lists all skills by qualified name with single-line descriptions when no query is given', async () => {
        const expected = '- pdf: Extract text and tables from PDF files.\n' +
            '- coding-workflow: Carry out a code change: refactor, bug fix, test fix.\n' +
            '- ext:ponytail: Minimal code for any coding task, including refactor.';
        expect(await call(undefined)).to.equal(expected);
        expect(await call({})).to.equal(expected);
    });

    it('keeps only skills matching any keyword, case-insensitively, best matches first', async () => {
        expect(await call({ query: 'Refactor BUG' })).to.equal(
            '- coding-workflow: Carry out a code change: refactor, bug fix, test fix.\n' +
            '- ext:ponytail: Minimal code for any coding task, including refactor.');
    });

    it('matches against the qualified name', async () => {
        expect(await call({ query: 'ext:' })).to.equal('- ext:ponytail: Minimal code for any coding task, including refactor.');
    });

    it('reports when nothing matches', async () => {
        expect(await call({ query: 'calendar' })).to.contain('No skill matches \'calendar\'');
    });
});
