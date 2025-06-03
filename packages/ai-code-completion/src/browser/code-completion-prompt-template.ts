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

export const codeCompletionPrompts: PromptVariantSet[] = [{
    id: 'code-completion-prompt',
    variants: [{
        id: 'code-completion-prompt-previous',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
You are a code completion agent. The current file you have to complete is named {{file}}.
The language of the file is {{language}}. Return your result as plain text without markdown formatting.
Finish the following code snippet.

{{prefix}}[[MARKER]]{{suffix}}

Only return the exact replacement for [[MARKER]] to complete the snippet.`
    }],
    defaultVariant: {
        id: 'code-completion-prompt-default',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
## Code snippet
\`\`\`
{{ prefix }}[[MARKER]]{{ suffix }}
\`\`\`

## Meta Data
- File: {{file}}
- Language: {{language}}

Replace [[MARKER]] with the exact code to complete the code snippet. Return only the replacement of [[MARKER]] as plain text.`,
    },
}
];
