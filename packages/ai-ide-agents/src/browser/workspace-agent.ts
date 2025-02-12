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
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common';
import { LanguageModelRequirement } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { workspacePromptTemplate } from '../common/workspace-prompt-template';
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID } from '../common/workspace-functions';

@injectable()
export class WorkspaceAgent extends AbstractStreamParsingChatAgent {

    name = 'Workspace';
    id = 'Workspace';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = 'This agent can access the users workspace, it can get a list of all available files and retrieve their content. \
    It can therefore answer questions about the current project, project files and source code in the workspace, such as how to build the project, \
    where to put source code, where to find specific code or configurations, etc.';
    override promptTemplates = [workspacePromptTemplate];
    override functions = [GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID];
    protected override systemPromptId: string | undefined = workspacePromptTemplate.id;
}
