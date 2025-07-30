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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser';
import { nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/browser';

export const PREFERENCE_NAME_ENABLE_AI = 'ai-features.AiEnable.enableAI';

export const aiIdePreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREFERENCE_NAME_ENABLE_AI]: {
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: nls.localize('theia/ai/ide/enableAI/mdDescription',
                '❗ This setting allows you to access the latest AI capabilities (Beta version).\
            \n\
            Please note that these features are in a beta phase, which means they may \
            undergo changes and will be further improved. It is important to be aware that these features may generate\
            continuous requests to the language models (LLMs) you provide access to. This might incur costs that you\
            need to monitor closely. By enabling this option, you acknowledge these risks.\
            \n\
            **Please note! The settings below in this section will only take effect\n\
            once the main feature setting is enabled. After enabling the feature, you need to configure at least one\
            LLM provider below. Also see [the documentation](https://theia-ide.org/docs/user_ai/)**.'),
            type: 'boolean',
            default: false,
        }
    }
};
