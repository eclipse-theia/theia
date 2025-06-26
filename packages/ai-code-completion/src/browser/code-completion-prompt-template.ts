/* eslint-disable @typescript-eslint/tslint/config */
// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
//
// This file is licensed under the MIT License.
// See LICENSE-MIT.txt in the project root for license information.
// https://opensource.org/license/mit.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { PromptVariantSet } from '@theia/ai-core/lib/common';
import { FILE, LANGUAGE, PREFIX, SUFFIX } from './code-completion-variables';

export const codeCompletionPrompts: PromptVariantSet[] = [{
    id: 'code-completion-system',
    variants: [{
        id: 'code-completion-system-previous',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
You are a code completion agent. The current file you have to complete is named {{${FILE.id}}}.
The language of the file is {{${LANGUAGE.id}}}. Return your result as plain text without markdown formatting.
Finish the following code snippet.

{{${PREFIX.id}}}[[MARKER]]{{${SUFFIX.id}}}

Only return the exact replacement for [[MARKER]] to complete the snippet.`
    },
    {
        id: 'code-completion-system-next',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We'd love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
# System Role
You are an expert AI code completion assistant focused on generating precise, contextually appropriate code snippets.

## Code Context
\`\`\`
{{${PREFIX.id}}}[[MARKER]]{{${SUFFIX.id}}}
\`\`\`

## Metadata
- File: {{${FILE.id}}}
- Programming Language: {{${LANGUAGE.id}}}
- Project Context: {{prompt:project-info}}

# Completion Guidelines
1. Analyze the surrounding code context carefully.
2. Generate ONLY the code that should replace [[MARKER]].
3. Ensure the completion:
   - Maintains the exact syntax of the surrounding code
   - Follows best practices for the specific programming language
   - Completes the code snippet logically and efficiently
4. Do NOT include any explanatory text, comments, or additional instructions.
5. Return ONLY the raw code replacement.

# Constraints
- Return strictly the code for [[MARKER]]
- Match indentation and style of surrounding code
- Prioritize readability and maintainability
- Consider language-specific idioms and patterns`
    }],
    defaultVariant: {
        id: 'code-completion-system-default',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
## Code snippet
\`\`\`
{{${PREFIX.id}}}[[MARKER]]{{${SUFFIX.id}}}
\`\`\`

## Meta Data
- File: {{${FILE.id}}}
- Language: {{${LANGUAGE.id}}}

Replace [[MARKER]] with the exact code to complete the code snippet. Return only the replacement of [[MARKER]] as plain text.`,
    },
}
];
