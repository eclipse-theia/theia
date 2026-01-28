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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger, MaybePromise, nls, URI } from '@theia/core';
import {
    AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest,
    AIVariableResolver, AIVariableService, ResolvedAIVariable
} from '../common/variable-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { SkillService } from './skill-service';
import { parseSkillFile } from '../common/skill';

export const SKILLS_VARIABLE: AIVariable = {
    id: 'skills',
    name: 'skills',
    description: nls.localize('theia/ai/core/skillsVariable/description',
        'Returns the list of available skills that can be used by AI agents')
};

export const SKILL_VARIABLE: AIVariable = {
    id: 'skill',
    name: 'skill',
    description: 'Returns the content of a specific skill by name',
    args: [{ name: 'skillName', description: 'The name of the skill to load' }]
};

export interface SkillSummary {
    name: string;
    description: string;
    location: string;
}

export interface ResolvedSkillsVariable extends ResolvedAIVariable {
    skills: SkillSummary[];
}

@injectable()
export class SkillsVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileService)
    protected readonly fileService: FileService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(SKILLS_VARIABLE, this);
        service.registerResolver(SKILL_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name === SKILLS_VARIABLE.name || request.variable.name === SKILL_VARIABLE.name) {
            return 1;
        }
        return -1;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedSkillsVariable | ResolvedAIVariable | undefined> {
        // Handle singular skill variable with argument
        if (request.variable.name === SKILL_VARIABLE.name) {
            return this.resolveSingleSkill(request);
        }

        // Handle plural skills variable
        if (request.variable.name === SKILLS_VARIABLE.name) {
            const skills = this.skillService.getSkills();
            this.logger.debug(`SkillsVariableContribution: Resolving skills variable, found ${skills.length} skills`);

            const skillSummaries: SkillSummary[] = skills.map(skill => ({
                name: skill.name,
                description: skill.description,
                location: skill.location
            }));

            const xmlValue = this.generateSkillsXML(skillSummaries);
            this.logger.debug(`SkillsVariableContribution: Generated XML:\n${xmlValue}`);

            return { variable: SKILLS_VARIABLE, skills: skillSummaries, value: xmlValue };
        }
        return undefined;
    }

    protected async resolveSingleSkill(request: AIVariableResolutionRequest): Promise<ResolvedAIVariable | undefined> {
        const skillName = request.arg;
        if (!skillName) {
            this.logger.warn('skill variable requires a skill name argument');
            return undefined;
        }

        const skill = this.skillService.getSkill(skillName);
        if (!skill) {
            this.logger.warn(`Skill not found: ${skillName}`);
            return undefined;
        }

        try {
            const skillFileUri = URI.fromFilePath(skill.location);
            const fileContent = await this.fileService.read(skillFileUri);
            const parsed = parseSkillFile(fileContent.value);
            return {
                variable: request.variable,
                value: parsed.content
            };
        } catch (error) {
            this.logger.error(`Failed to load skill content for '${skillName}': ${error}`);
            return undefined;
        }
    }

    /**
     * Generates XML representation of skills.
     * XML format follows the Agent Skills spec for structured skill representation.
     */
    protected generateSkillsXML(skills: SkillSummary[]): string {
        if (skills.length === 0) {
            return '<available_skills>\n</available_skills>';
        }

        const skillElements = skills.map(skill =>
            '<skill>\n' +
            `<name>${this.escapeXml(skill.name)}</name>\n` +
            `<description>${this.escapeXml(skill.description)}</description>\n` +
            `<location>${this.escapeXml(skill.location)}</location>\n` +
            '</skill>'
        ).join('\n');

        return `<available_skills>\n${skillElements}\n</available_skills>`;
    }

    protected escapeXml(text: string): string {
        const QUOT = '&quot;';
        const APOS = '&apos;';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, QUOT)
            .replace(/'/g, APOS);
    }
}
