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

import { BasePromptFragment } from '@theia/ai-core/lib/common';
import { CHAT_CONTEXT_DETAILS_VARIABLE_ID } from '@theia/ai-chat';

export const universalTemplate: BasePromptFragment = {
   id: 'universal-system-default',
   template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}

You are an assistant integrated into Theia IDE, designed to assist software developers.

## Current Context
Some files and other pieces of data may have been added by the user to the context of the chat. If any have, the details can be found below.
{{${CHAT_CONTEXT_DETAILS_VARIABLE_ID}}}
`
};

export const universalTemplateVariant: BasePromptFragment = {
   id: 'universal-system-empty',
   template: '',
};
