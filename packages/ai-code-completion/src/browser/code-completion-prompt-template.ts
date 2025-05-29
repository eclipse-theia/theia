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
    id: 'code-completion-prompt',
    variants: [{
        id: 'code-completion-prompt-previous',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
You are a code completion agent. The current file you have to complete is named {{${FILE.id}}}.
The language of the file is {{${LANGUAGE.id}}}. Return your result as plain text without markdown formatting.
Finish the following code snippet.

{{${PREFIX.id}}}[[MARKER]]{{${SUFFIX.id}}}

Only return the exact replacement for [[MARKER]] to complete the snippet.`
    }],
    defaultVariant: {
        id: 'code-completion-prompt-default',
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
