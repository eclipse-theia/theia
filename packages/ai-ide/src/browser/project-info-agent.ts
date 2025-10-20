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
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat';
import { LanguageModelRequirement } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { projectInfoSystemVariants, projectInfoTemplateVariants } from '../common/project-info-prompt-template';
import { nls } from '@theia/core';

@injectable()
export class ProjectInfoAgent extends AbstractStreamParsingChatAgent {

    name = 'ProjectInfo';
    id = 'ProjectInfo';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/code',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/projectInfoAgent/description',
        'An AI assistant for managing project information templates. This agent helps create, update, and review the .prompts/project-info.prompttemplate file which provides ' +
        'context about your project to other AI agents. It can analyze your workspace to suggest project information or update existing templates based on your requirements.');

    override get tags(): string[] {
        return [...super.tags, 'Alpha'];
    }

    override prompts = [projectInfoSystemVariants, projectInfoTemplateVariants];
    protected override systemPromptId: string | undefined = projectInfoSystemVariants.id;

}
