// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AGENT_DELEGATION_FUNCTION_ID, PromptService } from '@theia/ai-core';
import { GitHubChatAgentId } from './github-chat-agent';
import { nls } from '@theia/core';

@injectable()
export class GitHubCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: 'github',
            template: this.buildTemplate()
        });
    }

    protected buildTemplate(): string {
        const name = nls.localize('theia/ai/ide/githubCapability/name', 'GitHub');
        const description = nls.localize('theia/ai/ide/githubCapability/description',
            'Allows the agent to interact with GitHub. For this, the agent can delegate to the GitHub agent, \
            which can read and write issues, pull requests, comments, and repository contents.');

        return `---
name: ${name}
description: ${description}
---
## GitHub

You can interact with GitHub (issues, pull requests, repositories, etc.) by delegating to the GitHub agent \
using the ~{${AGENT_DELEGATION_FUNCTION_ID}} tool.

**Agent ID:** '${GitHubChatAgentId}'

### When to use GitHub delegation

Use this when the task requires reading from or writing to GitHub, for example:
- Retrieving issue or pull request details
- Creating or updating issues and pull requests
- Listing repository contents, branches, or commits
- Posting comments on issues or pull requests

### How to delegate effectively

The quality of the result depends entirely on the precision of the prompt you provide. Always include:
- **What to do**: the exact GitHub operation (e.g., "retrieve", "create", "comment on")
- **What to act on**: the specific resource (e.g., issue #42, PR #7, repository owner/repo)
- **What to return**: the exact fields or information you need back (e.g., title, body, all comments, labels)

#### Example — retrieving an issue:
\`\`\`
Please retrieve all details for issue #123 in the current repository, including:
- Title, body, labels, state, assignees
- All comments in full
- Any referenced issues or pull requests
\`\`\`

#### Example — creating an issue:
\`\`\`
Please create a new issue in the current repository with:
- Title: "Fix null pointer in FooService"
- Body: "When calling FooService.bar() with a null argument, a NullPointerException is thrown. ..."
- Labels: bug
\`\`\`

**IMPORTANT:** Be explicit and complete in your delegation prompt. Vague prompts lead to incomplete results \
and require follow-up delegations.`;
    }
}
