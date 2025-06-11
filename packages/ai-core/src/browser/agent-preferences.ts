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

import { nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';
import {
  NOTIFICATION_TYPES
} from '../common/notification-types';

export const AGENT_SETTINGS_PREF = 'ai-features.agentSettings';

export const AgentSettingsPreferenceSchema: PreferenceSchema = {
  type: 'object',
  properties: {
    [AGENT_SETTINGS_PREF]: {
      type: 'object',
      title: nls.localize('theia/ai/agents/title', 'Agent Settings'),
      hidden: true,
      markdownDescription: nls.localize('theia/ai/agents/mdDescription', 'Configure agent settings such as enabling or disabling specific agents, configuring prompts and \
        selecting LLMs.'),
      additionalProperties: {
        type: 'object',
        properties: {
          enable: {
            type: 'boolean',
            title: nls.localize('theia/ai/agents/enable/title', 'Enable Agent'),
            markdownDescription: nls.localize('theia/ai/agents/enable/mdDescription', 'Specifies whether the agent should be enabled (true) or disabled (false).'),
            default: true
          },
          languageModelRequirements: {
            type: 'array',
            title: nls.localize('theia/ai/agents/languageModelRequirements/title', 'Language Model Requirements'),
            markdownDescription: nls.localize('theia/ai/agents/languageModelRequirements/mdDescription', 'Specifies the used language models for this agent.'),
            items: {
              type: 'object',
              properties: {
                purpose: {
                  type: 'string',
                  title: nls.localize('theia/ai/agents/languageModelRequirements/purpose/title', 'Purpose'),
                  markdownDescription: nls.localize('theia/ai/agents/languageModelRequirements/purpose/mdDescription', 'The purpose for which this language model is used.')
                },
                identifier: {
                  type: 'string',
                  title: nls.localize('theia/ai/agents/languageModelRequirements/identifier/title', 'Identifier'),
                  markdownDescription: nls.localize('theia/ai/agents/languageModelRequirements/identifier/mdDescription', 'The identifier of the language model to be used.')
                }
              },
              required: ['purpose', 'identifier']
            }
          },
          selectedVariants: {
            type: 'object',
            title: nls.localize('theia/ai/agents/selectedVariants/title', 'Selected Variants'),
            markdownDescription: nls.localize('theia/ai/agents/selectedVariants/mdDescription', 'Specifies the currently selected prompt variants for this agent.'),
            additionalProperties: {
              type: 'string'
            }
          },
          completionNotification: {
            type: 'string',
            enum: [...NOTIFICATION_TYPES],
            title: nls.localize('theia/ai/agents/completionNotification/title', 'Completion Notification'),
            markdownDescription: nls.localize('theia/ai/agents/completionNotification/mdDescription',
              'Notification behavior when this agent completes a task. If not set, the global default notification setting will be used.\n\
                - `os-notification`: Show OS/system notifications\n\
                - `message`: Show notifications in the status bar/message area\n\
                - `blink`: Blink or highlight the UI\n\
                - `off`: Disable notifications for this agent')
          }
        },
        required: ['languageModelRequirements']
      }
    }
  }
};
