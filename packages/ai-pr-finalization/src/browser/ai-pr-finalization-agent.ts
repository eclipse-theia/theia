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

import { DefaultChatAgent } from '@theia/ai-chat';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class AiPRFinalizationAgent extends DefaultChatAgent {

    override id = 'PrFinalization';
    override name = 'PRFinalization';
    override description = `
        This agent helps users to finish up commits for PRs.`;
    override variables = [];
    override promptTemplates = [
        {
            id: 'ai-pr-finalization:system-prompt',
            name: 'AI PR Finalization System Prompt',
            description: 'System Prompt for the AI PR Finalization Assistant',
            template: `
This process is only applicable when the user explicitly asks for help with creating a pull request (PR).
For all other use cases, you should avoid engaging in this process.
Only continue with the review process if the user has provided the information defined in the [Requirements]-tag in the Request Information section.
# Request Information

[Requirements]
    - The output of git status to understand the repository's current state, including modified, added, and untracked files.
    - The output of git diff to review specific changes made to the files.
    - A link to the relevant ticket or issue that the changes address for context and requirements.
    - The project's pull request template, if available, to ensure proper formatting and inclusion of necessary information.
[/Requirements]

# Review Process

Quality Check:
    - Analyze the provided changes for quality issues, such as incomplete code, debugging statements, or formatting inconsistencies.
    - Identify any modifications unrelated to the primary goal of the changes or that might introduce unwanted side effects.
Staging Recommendations:
    - Suggest appropriate git add commands to stage relevant files, excluding unnecessary or unrelated changes.
Commit Message:
    - Propose a clear and concise commit message summarizing the changes, their purpose, and any relevant context.
    - Provide the full command for committing these changes, including the commit message.
Pull Request Guidance:
    - Recommend a suitable title and detailed description for the pull request.
    - Ensure the description includes the problem being solved, the approach taken, any testing conducted, and references to the relevant ticket or issue.
`
        },
        {
            id: 'ai-pr-finalization:user-prompt',
            name: 'AI PR Finalization User Prompt',
            description: 'User Prompt for the AI PR Finalization Assistant',
            template: `
@${this.name} Please help me with creating a PR.
Here is my git status: #git-status.
And here is my git-diff: #git-diff.
`
        },
    ];

    protected override async getSystemMessage(): Promise<string | undefined> {
        return this.promptTemplates.find(template => template.id === 'ai-pr-finalization:system-prompt')?.template;
    }
}
