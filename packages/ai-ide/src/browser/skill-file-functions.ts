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

import { listByKeywords, ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { parseSkillFile } from '@theia/ai-core/lib/common/skill';
import { GET_SKILL_FILE_CONTENT_FUNCTION_ID, LIST_SKILLS_FUNCTION_ID } from '../common/workspace-functions';

@injectable()
export class ListSkills implements ToolProvider {
    static ID = LIST_SKILLS_FUNCTION_ID;

    @inject(SkillService)
    protected readonly skillService: SkillService;

    getTool(): ToolRequest {
        return {
            id: ListSkills.ID,
            name: ListSkills.ID,
            description: 'Lists the available skills by name and description. Skills provide reusable instructions and domain knowledge; ' +
                `load a fitting one with ${GET_SKILL_FILE_CONTENT_FUNCTION_ID}. ` +
                'Pass a query with a few keywords from the task to get only the skills whose name or description matches any of them, best matches first. ' +
                'Omit the query to list all skills.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Optional space-separated keywords, matched case-insensitively against skill names and descriptions (e.g. \'refactor test\')'
                    }
                },
                required: []
            },
            handler: (arg_string: string) => this.listSkills(arg_string)
        };
    }

    protected async listSkills(arg_string: string): Promise<string> {
        const query: unknown = arg_string ? JSON.parse(arg_string).query : undefined;
        const keywords = typeof query === 'string' ? query.trim() : '';
        const entries = this.skillService.getSkills().map(skill => ({ name: skill.qualifiedName, description: skill.description }));
        return listByKeywords(entries, keywords) ?? (keywords
            ? `No skill matches '${keywords}'. Retry with other keywords or without a query to list all skills.`
            : 'No skills available.');
    }
}

@injectable()
export class GetSkillFileContent implements ToolProvider {
    static ID = GET_SKILL_FILE_CONTENT_FUNCTION_ID;

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(FileService)
    protected readonly fileService: FileService;

    getTool(): ToolRequest {
        return {
            id: GetSkillFileContent.ID,
            name: GetSkillFileContent.ID,
            description: 'Returns the content of a skill file by skill name. Use this to read the full instructions of a skill listed by ' +
                `${LIST_SKILLS_FUNCTION_ID} or in the available_skills. ` +
                'If the returned skill references another available skill by its exact name or with /<skill-name> syntax, load that skill with this same tool ' +
                'when relevant or requested. ' +
                'Pass skill names without the leading slash. The skill name must match one of the discovered skills.',
            parameters: {
                type: 'object',
                properties: {
                    skillName: {
                        type: 'string',
                        description: 'The exact name of the skill to retrieve, without a leading slash (e.g., \'pdf-processing\')'
                    }
                },
                required: ['skillName']
            },
            handler: (arg_string: string) => this.getSkillFileContent(arg_string)
        };
    }

    private async getSkillFileContent(arg_string: string): Promise<string> {
        const args = JSON.parse(arg_string);
        const skillName: string = args.skillName;

        const skill = this.skillService.getSkill(skillName);

        if (!skill) {
            return JSON.stringify({ error: `Skill not found: ${skillName}` });
        }

        try {
            const skillFileUri = URI.fromFilePath(skill.location);
            const fileContent = await this.fileService.read(skillFileUri);
            const parsed = parseSkillFile(fileContent.value);
            return parsed.content;
        } catch (error) {
            return JSON.stringify({ error: `Failed to load skill content: ${error}` });
        }
    }
}
