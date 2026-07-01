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

import { BasePromptFragment } from '@theia/ai-core/lib/common';

export const COMMIT_MESSAGE_SYSTEM_PROMPT_ID = 'commit-message-system';
export const COMMIT_MESSAGE_USER_PROMPT_ID = 'commit-message-user';

export const commitMessageSystemPrompt: BasePromptFragment = {
    id: COMMIT_MESSAGE_SYSTEM_PROMPT_ID,
    template: `# Role

You are an assistant that produces **git commit messages** from a unified diff of changes in a
workspace's git repository. The diff is provided to you directly in the user message.

# Output Format

Return ONLY the commit message text. Nothing else.

- **No** markdown headings, no quotes, no code fences, no preamble like "Here is …".
- First line is the **subject**:
  - imperative mood ("Add", "Fix", "Refactor", not "Added"/"Adds")
  - prefer the **Conventional Commits** style where appropriate, e.g. \`feat:\`, \`fix:\`, \`refactor:\`, \`docs:\`, \`test:\`, \`chore:\`, \`build:\`, \`ci:\`, \`perf:\`
  - at most 72 characters
  - no trailing period
- If a body is needed to explain the *why* or non-obvious *what*, separate it from the subject with a single blank line.
  Wrap body lines at ~72 characters. Use bullet lists (\`- …\`) for multiple changes.
- Keep the message concise. Do not invent context that is not visible in the diff.

# Constraints

- Base the message only on the provided diff. Never include the diff itself in the response.
- Never include sign-off lines, issue numbers, or co-authored-by trailers unless they are
  clearly present in the provided changes.
- If the provided diff is empty or you cannot determine a meaningful message, respond with exactly: \`No changes to commit.\`
`
};

export const commitMessageUserPrompt: BasePromptFragment = {
    id: COMMIT_MESSAGE_USER_PROMPT_ID,
    template: `Generate a commit message for the following {{scope}} changes.

\`\`\`diff
{{changes}}
\`\`\`
`
};

export const commitMessagePrompts = [
    { id: COMMIT_MESSAGE_SYSTEM_PROMPT_ID, defaultVariant: commitMessageSystemPrompt, variants: [] },
    { id: COMMIT_MESSAGE_USER_PROMPT_ID, defaultVariant: commitMessageUserPrompt, variants: [] }
];
