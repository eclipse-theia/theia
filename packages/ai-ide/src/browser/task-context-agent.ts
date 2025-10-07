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

import { Agent, LanguageModelRequirement } from '@theia/ai-core';
import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { taskContextSystemVariants, taskContextTemplateVariants, taskContextUpdateVariants } from '../common/task-context-prompt-template';

@injectable()
export class TaskContextAgent implements Agent {
    static ID = 'TaskContext';

    id = TaskContextAgent.ID;
    name = 'TaskContext';
    description = nls.localize('theia/ai/taskcontext/taskContextAgent/description',
        'An AI assistant that analyzes chat sessions and creates structured task summaries for coding tasks. ' +
        'This agent specializes in extracting key information from conversations and formatting them into comprehensive task context documents that can be used by other agents.');

    variables = [];
    prompts = [taskContextSystemVariants, taskContextTemplateVariants, taskContextUpdateVariants];
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'TaskContext Creation/Update',
        identifier: 'default/code',
    }];
    agentSpecificVariables = [];
    functions = [];
}
