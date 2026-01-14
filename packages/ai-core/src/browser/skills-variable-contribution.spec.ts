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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { ILogger } from '@theia/core';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { SkillsVariableContribution, SKILLS_VARIABLE, ResolvedSkillsVariable } from './skills-variable-contribution';
import { SkillService } from './skill-service';
import { Skill } from '../common/skill';

disableJSDOM();

describe('SkillsVariableContribution', () => {
    let contribution: SkillsVariableContribution;
    let skillService: sinon.SinonStubbedInstance<SkillService>;
    let container: Container;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();

        skillService = {
            getSkills: sinon.stub(),
            getSkill: sinon.stub(),
            onSkillsChanged: sinon.stub() as unknown as typeof skillService.onSkillsChanged
        };

        container.bind(SkillService).toConstantValue(skillService as unknown as SkillService);

        const mockLogger = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            debug: sinon.stub(),
            trace: sinon.stub(),
            fatal: sinon.stub(),
            log: sinon.stub(),
            setLogLevel: sinon.stub(),
            getLogLevel: sinon.stub(),
            isEnabled: sinon.stub().returns(true),
            ifEnabled: sinon.stub(),
            child: sinon.stub()
        };
        container.bind(ILogger).toConstantValue(mockLogger as unknown as ILogger);

        container.bind(SkillsVariableContribution).toSelf().inSingletonScope();

        contribution = container.get(SkillsVariableContribution);
    });

    describe('SKILLS_VARIABLE', () => {
        it('should have correct id and name', () => {
            expect(SKILLS_VARIABLE.id).to.equal('skills');
            expect(SKILLS_VARIABLE.name).to.equal('skills');
        });

        it('should have a description', () => {
            expect(SKILLS_VARIABLE.description).to.be.a('string');
            expect(SKILLS_VARIABLE.description.length).to.be.greaterThan(0);
        });
    });

    describe('canResolve', () => {
        it('should return 1 for skills variable', () => {
            const result = contribution.canResolve(
                { variable: SKILLS_VARIABLE },
                {}
            );
            expect(result).to.equal(1);
        });

        it('should return -1 for other variables', () => {
            const result = contribution.canResolve(
                { variable: { id: 'other', name: 'other', description: 'other' } },
                {}
            );
            expect(result).to.equal(-1);
        });
    });

    describe('resolve', () => {
        it('should return undefined for non-skills variable', async () => {
            const result = await contribution.resolve(
                { variable: { id: 'other', name: 'other', description: 'other' } },
                {}
            );
            expect(result).to.be.undefined;
        });

        it('should return empty XML when no skills available', async () => {
            skillService.getSkills.returns([]);

            const result = await contribution.resolve(
                { variable: SKILLS_VARIABLE },
                {}
            ) as ResolvedSkillsVariable;

            expect(result).to.not.be.undefined;
            expect(result.variable).to.equal(SKILLS_VARIABLE);
            expect(result.skills).to.deep.equal([]);
            expect(result.value).to.equal('<available_skills>\n</available_skills>');
        });

        it('should return XML with skills when available', async () => {
            const skills: Skill[] = [
                {
                    name: 'pdf-processing',
                    description: 'Processes PDF documents and extracts text content',
                    location: '/path/to/skills/pdf-processing/SKILL.md'
                },
                {
                    name: 'data-analysis',
                    description: 'Analyzes data sets and generates reports',
                    location: '/path/to/skills/data-analysis/SKILL.md'
                }
            ];
            skillService.getSkills.returns(skills);

            const result = await contribution.resolve(
                { variable: SKILLS_VARIABLE },
                {}
            ) as ResolvedSkillsVariable;

            expect(result).to.not.be.undefined;
            expect(result.variable).to.equal(SKILLS_VARIABLE);
            expect(result.skills).to.have.lengthOf(2);
            expect(result.skills[0].name).to.equal('pdf-processing');
            expect(result.skills[1].name).to.equal('data-analysis');

            const expectedXml =
                '<available_skills>\n' +
                '<skill name="pdf-processing">\n' +
                '<description>Processes PDF documents and extracts text content</description>\n' +
                '</skill>\n' +
                '<skill name="data-analysis">\n' +
                '<description>Analyzes data sets and generates reports</description>\n' +
                '</skill>\n' +
                '</available_skills>';
            expect(result.value).to.equal(expectedXml);
        });

        it('should escape XML special characters in descriptions', async () => {
            const skills: Skill[] = [
                {
                    name: 'test-skill',
                    description: 'Handles <tags> & "quotes" with \'apostrophes\'',
                    location: '/path/to/skill/SKILL.md'
                }
            ];
            skillService.getSkills.returns(skills);

            const result = await contribution.resolve(
                { variable: SKILLS_VARIABLE },
                {}
            ) as ResolvedSkillsVariable;

            expect(result.value).to.include('&lt;tags&gt;');
            expect(result.value).to.include('&amp;');
            expect(result.value).to.include('&quot;quotes&quot;');
            expect(result.value).to.include('&apos;apostrophes&apos;');
        });

        it('should escape XML special characters in name', async () => {
            const skills: Skill[] = [
                {
                    name: 'skill<test>',
                    description: 'Test skill',
                    location: '/path/with/&special/chars'
                }
            ];
            skillService.getSkills.returns(skills);

            const result = await contribution.resolve(
                { variable: SKILLS_VARIABLE },
                {}
            ) as ResolvedSkillsVariable;

            expect(result.value).to.include('name="skill&lt;test&gt;"');
        });
    });
});
