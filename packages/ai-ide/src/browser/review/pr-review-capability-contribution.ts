/* eslint-disable max-len */
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

import { AGENT_DELEGATION_FUNCTION_ID, PromptService } from '@theia/ai-core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { SHELL_EXECUTION_FUNCTION_ID } from '@theia/ai-terminal/lib/common/shell-execution-server';
import {
    LIST_TASKS_FUNCTION_ID,
    RUN_TASK_FUNCTION_ID
} from '../../common/workspace-functions';
import { USER_INTERACTION_FUNCTION_ID } from '../../common/user-interaction-tool';
import { GitHubChatAgentId } from '../github-chat-agent';
import { ExploreAgentId } from '../explore-agent';
import {
    PR_REVIEW_CODEBASE_EXPLORATION_CAPABILITY_ID,
    PR_REVIEW_GITHUB_INFORMATION_CAPABILITY_ID,
    PR_REVIEW_LOCAL_CHECKOUT_CAPABILITY_ID,
    PR_REVIEW_LOCAL_VALIDATION_CAPABILITY_ID,
    PR_REVIEW_PENDING_GITHUB_REVIEW_CAPABILITY_ID
} from './pr-review-prompt-template';

@injectable()
export class PRReviewCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: PR_REVIEW_GITHUB_INFORMATION_CAPABILITY_ID,
            template: this.buildGitHubInformationTemplate()
        });
        this.promptService.addBuiltInPromptFragment({
            id: PR_REVIEW_LOCAL_CHECKOUT_CAPABILITY_ID,
            template: this.buildLocalCheckoutTemplate()
        });
        this.promptService.addBuiltInPromptFragment({
            id: PR_REVIEW_LOCAL_VALIDATION_CAPABILITY_ID,
            template: this.buildLocalValidationTemplate()
        });
        this.promptService.addBuiltInPromptFragment({
            id: PR_REVIEW_CODEBASE_EXPLORATION_CAPABILITY_ID,
            template: this.buildCodebaseExplorationTemplate()
        });
        this.promptService.addBuiltInPromptFragment({
            id: PR_REVIEW_PENDING_GITHUB_REVIEW_CAPABILITY_ID,
            template: this.buildPendingGitHubReviewTemplate()
        });
    }

    protected buildGitHubInformationTemplate(): string {
        const name = nls.localize('theia/ai/ide/prReview/capability/githubInfo/name', 'GH PR Info');
        const description = nls.localize('theia/ai/ide/prReview/capability/githubInfo/description',
            'Delegates to the GitHub agent to retrieve pull request metadata, diffs, comments, checks, and linked issues.');

        return `---
name: ${name}
description: ${description}
---
## GH PR Info

**GH PR Info is ENABLED.** Use it to retrieve complete pull request information through delegation to the GitHub agent.

Use ~{${AGENT_DELEGATION_FUNCTION_ID}} with agent ID '${GitHubChatAgentId}' for every GitHub read.

Ask the GitHub agent to retrieve:
- PR title, description, author, source branch, target branch, head SHA, state, and URL
- The complete list of changed files with status and diffs/patches
- ALL existing review comments, conversation comments, and pending/active review context visible to the user
- CI/check status
- Any linked or referenced issues

Example delegation prompt:
\`\`\`
Please retrieve comprehensive information about pull request #<NUMBER>. I need:
1. PR title, description, author, source and target branch names, head SHA, URL, and current state
2. The complete list of changed files with their diffs/patches
3. ALL review comments and conversation comments
4. CI/check status
5. Any linked or referenced issues
Completeness is critical. Every review comment and every changed file must be included.
\`\`\``;
    }

    protected buildLocalCheckoutTemplate(): string {
        const name = nls.localize('theia/ai/ide/prReview/capability/localCheckout/name', 'Checkout');
        const description = nls.localize('theia/ai/ide/prReview/capability/localCheckout/description',
            'Checks out the pull request locally and protects existing worktree changes.');

        return `---
name: ${name}
description: ${description}
---
## Checkout

**Checkout is ENABLED.** Use it to switch to the PR branch locally while protecting the user's current worktree state.

### Available tools

- ~{${SHELL_EXECUTION_FUNCTION_ID}} - run git and fallback shell commands for checkout, cleanup, merge-base lookup, and target-branch line lookup.
- Use this shell access only for current-branch PR number inference, checkout, cleanup, merge-base lookup, and target-branch line lookup.

### Checkout workflow

Before modifying the working tree, inform the user via ~{${USER_INTERACTION_FUNCTION_ID}} (single-step, options "Proceed" and "Abort") that you need to switch branches and may stash uncommitted changes.

Create the review plan only after this checkout workflow is complete. This avoids creating a plan, stashing it, and popping it again just to switch branches.

1. Record the current branch with \`git rev-parse --abbrev-ref HEAD\`. Save it as \`<original-branch>\` for cleanup.
2. Check the worktree with \`git status --porcelain\`.
3. If the worktree is dirty, stash the user's changes with \`git stash push -u -m "pr-review-user-<number>"\`. Record whether this stash was created.
4. Check out the PR branch with \`gh pr checkout <number>\`.
   - Fallback: \`git fetch origin pull/<number>/head:pr-<number> && git checkout pr-<number>\`.
5. Determine the merge base commit SHA with \`git merge-base HEAD <base-branch>\` (use the base branch from the PR info, e.g. \`origin/master\`). Store this SHA for diff links and permalinks.

Store these values for the review plan and cleanup:
- Original branch
- Whether user changes were stashed and the stash message
- PR branch checkout result
- Merge base SHA`;
    }

    protected buildLocalValidationTemplate(): string {
        const name = nls.localize('theia/ai/ide/prReview/capability/localValidation/name', 'Build');
        const description = nls.localize('theia/ai/ide/prReview/capability/localValidation/description',
            'Runs local install, build, lint, test, or comparable validation tasks for the pull request.');

        return `---
name: ${name}
description: ${description}
---
## Build

**Build is ENABLED.** Use it to run a clean build or comparable local validation for the pull request.

### Available tools

- ~{${SHELL_EXECUTION_FUNCTION_ID}} - run fallback shell commands when no suitable task exists
- ~{${LIST_TASKS_FUNCTION_ID}} - list available workspace tasks
- ~{${RUN_TASK_FUNCTION_ID}} - run install, build, lint, or test tasks when available

### Build and validation workflow

1. Use ~{${LIST_TASKS_FUNCTION_ID}} to check whether install/build/test/lint tasks exist.
2. Prefer ~{${RUN_TASK_FUNCTION_ID}} for task-backed validation.
3. Use ~{${SHELL_EXECUTION_FUNCTION_ID}} only when no suitable task exists or task execution fails in a way that requires a fallback command.
4. If dependencies are missing, identify the correct install task or command before building.
5. Build the project or run the closest available validation for the changed area.
6. If validation fails, record the failure as a critical finding and continue the review.

Store this value for the review plan:
- Build/validation status`;
    }

    protected buildCodebaseExplorationTemplate(): string {
        const name = nls.localize('theia/ai/ide/prReview/capability/codebaseExploration/name', 'Delegated Exploration');
        const description = nls.localize('theia/ai/ide/prReview/capability/codebaseExploration/description',
            'Delegates focused architecture, usage, convention, and tests exploration to the Explore agent. When disabled, the PR reviewer explores with its own tools.');

        return `---
name: ${name}
description: ${description}
---
## Delegated Exploration

**Delegated Exploration is ENABLED.** Delegate broad exploration to the Explore agent before performing the detailed review yourself. If this capability is disabled, perform the exploration yourself with your file, diagnostics, and workspace search tools.

Use ~{${AGENT_DELEGATION_FUNCTION_ID}} with agent ID '${ExploreAgentId}' to investigate:
- The architecture relevant to the changed files
- Related files that might be affected by the changes
- Existing patterns and conventions in the modified areas
- Tests for the changed areas

Make multiple parallel delegations for different areas of the codebase. Each delegation should be focused on a specific area or question. Limit delegations to **3-5 focused explorations**. For large PRs (20+ changed files), group files into logical areas first and explore per-area rather than per-file.

The Explore agent has no prior context about the PR. Always include a brief summary of the relevant PR changes in each delegation prompt so the agent can assess impact, not just describe static architecture.

Example delegation prompts:
\`\`\`
// Delegation 1: Understand the component architecture
"This PR modifies <file1> and <file2> to add <brief description of change>. Examine these files and their surrounding directory. What is the architecture? What patterns are used? What are the key abstractions? Are there any conventions the PR changes should follow?"

// Delegation 2: Find related consumers
"This PR changes the API exported by <changed-module> by <brief description>. Find all files that import from or depend on this module. How do they use the APIs that were modified? Could any of them be affected by these changes?"

// Delegation 3: Explore tests
"This PR modifies <changed-files> to <brief description>. Find all test files related to these files. What scenarios do they cover? Are there gaps that should be addressed given the changes?"
\`\`\``;
    }

    protected buildPendingGitHubReviewTemplate(): string {
        const name = nls.localize('theia/ai/ide/prReview/capability/pendingGitHubReview/name', 'Pending GH Review');
        const description = nls.localize('theia/ai/ide/prReview/capability/pendingGitHubReview/description',
            'Delegates to the GitHub agent to create or update a pending pull request review with prepared inline comments after explicit user confirmation.');

        return `---
name: ${name}
description: ${description}
---
## Pending GH Review

**Pending GH Review is ENABLED.** Use it to create or update a pending GitHub review through delegation to the GitHub agent, only after the prepared comments are stored in the review plan and the user explicitly chooses to create the pending review.

Use ~{${AGENT_DELEGATION_FUNCTION_ID}} with agent ID '${GitHubChatAgentId}' for every GitHub write.

When the user chooses to create the pending review:
1. Read the "Prepared GitHub Review Comments" section from the review plan.
2. Include only entries marked "Ready".
3. Pass each entry to the GitHub agent with the exact stored comment text and exact stored inline location.
4. Instruct the GitHub agent to create a **pending** pull request review on the PR and to **not submit** it.
5. If a pending review of yours already exists on this PR, instruct the GitHub agent to add comments to it rather than creating a new one.
6. Do not repeat comments that are already present.

Tell the user that the pending review is only visible to them until they submit it in the GitHub UI, and that they can edit the comments there before submission.`;
    }
}
