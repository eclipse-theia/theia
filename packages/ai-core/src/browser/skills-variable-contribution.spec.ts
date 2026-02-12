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
import { ILogger } from '@theia/core';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { SkillsVariableContribution, SKILLS_VARIABLE, SKILL_VARIABLE, ResolvedSkillsVariable } from './skills-variable-contribution';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { SkillService } from './skill-service';
import { Skill } from '../common/skill';

disableJSDOM();

describe('SkillsVariableContribution', () => {
    let contribution: SkillsVariableContribution;
    let skillService: sinon.SinonStubbedInstance<SkillService>;
    let mockFileService: { read: sinon.SinonStub, exists: sinon.SinonStub };
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

        mockFileService = {
            read: sinon.stub(),
            exists: sinon.stub(),
        };
        container.bind(FileService).toConstantValue(mockFileService as unknown as FileService);

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

    describe('SKILL_VARIABLE', () => {
        it('should have correct id and name', () => {
            expect(SKILL_VARIABLE.id).to.equal('skill');
            expect(SKILL_VARIABLE.name).to.equal('skill');
        });

        it('should have args defined', () => {
            expect(SKILL_VARIABLE.args).to.not.be.undefined;
            expect(SKILL_VARIABLE.args).to.have.lengthOf(1);
            expect(SKILL_VARIABLE.args![0].name).to.equal('skillName');
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

        it('should return 1 for skill variable', () => {
            const result = contribution.canResolve(
                { variable: SKILL_VARIABLE },
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
            expect(result.skills[0].location).to.equal('/path/to/skills/pdf-processing/SKILL.md');
            expect(result.skills[1].name).to.equal('data-analysis');
            expect(result.skills[1].location).to.equal('/path/to/skills/data-analysis/SKILL.md');

            const expectedXml =
                '<available_skills>\n' +
                '<skill>\n' +
                '<name>pdf-processing</name>\n' +
                '<description>Processes PDF documents and extracts text content</description>\n' +
                '<location>/path/to/skills/pdf-processing/SKILL.md</location>\n' +
                '</skill>\n' +
                '<skill>\n' +
                '<name>data-analysis</name>\n' +
                '<description>Analyzes data sets and generates reports</description>\n' +
                '<location>/path/to/skills/data-analysis/SKILL.md</location>\n' +
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

        it('should escape XML special characters in name and location', async () => {
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

            expect(result.value).to.include('<name>skill&lt;test&gt;</name>');
            expect(result.value).to.include('<location>/path/with/&amp;special/chars</location>');
        });
    });

    describe('resolve single skill', () => {
        it('should return undefined when no arg provided', async () => {
            const result = await contribution.resolve(
                { variable: SKILL_VARIABLE },
                {}
            );
            expect(result).to.be.undefined;
        });

        it('should return undefined when skill not found', async () => {
            skillService.getSkill.returns(undefined);

            const result = await contribution.resolve(
                { variable: SKILL_VARIABLE, arg: 'non-existent' },
                {}
            );
            expect(result).to.be.undefined;
        });

        it('should return skill content when skill found', async () => {
            const skill: Skill = {
                name: 'my-skill',
                description: 'A test skill',
                location: '/path/to/skills/my-skill/SKILL.md'
            };
            skillService.getSkill.withArgs('my-skill').returns(skill);
            mockFileService.read.resolves({
                value: `---
name: my-skill
description: A test skill
---
# My Skill Content

This is the skill content.`
            });

            const result = await contribution.resolve(
                { variable: SKILL_VARIABLE, arg: 'my-skill' },
                {}
            );

            expect(result).to.not.be.undefined;
            expect(result!.variable).to.equal(SKILL_VARIABLE);
            expect(result!.value).to.equal('# My Skill Content\n\nThis is the skill content.');
        });

        it('should return undefined when file read fails', async () => {
            const skill: Skill = {
                name: 'my-skill',
                description: 'A test skill',
                location: '/path/to/skills/my-skill/SKILL.md'
            };
            skillService.getSkill.withArgs('my-skill').returns(skill);
            mockFileService.read.rejects(new Error('File not found'));

            const result = await contribution.resolve(
                { variable: SKILL_VARIABLE, arg: 'my-skill' },
                {}
            );

            expect(result).to.be.undefined;
        });
    });
});
