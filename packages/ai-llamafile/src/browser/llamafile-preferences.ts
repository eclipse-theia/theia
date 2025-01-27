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

import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';

export const AI_LLAMAFILE_PREFERENCES_TITLE = '✨ AI LlamaFile';
export const PREFERENCE_LLAMAFILE = 'ai-features.llamafile.llamafiles';

export const aiLlamafilePreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREFERENCE_LLAMAFILE]: {
            title: AI_LLAMAFILE_PREFERENCES_TITLE,
            markdownDescription: 'This setting allows you to configure and manage LlamaFile models in Theia IDE.\
            \n\
            Each entry requires a user-friendly `name`, the file `uri` pointing to your LlamaFile, and the `port` on which it will run.\
            \n\
            To start a LlamaFile, use the "Start LlamaFile" command, which enables you to select the desired model.\
            \n\
            If you edit an entry (e.g., change the port), any running instance will stop, and you will need to manually start it again.\
            \n\
            [Learn more about configuring and managing LlamaFiles in the Theia IDE documentation](https://theia-ide.org/docs/user_ai/#llamafile-models).',
            type: 'array',
            default: [],
            items: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The model name to use for this Llamafile.'
                    },
                    uri: {
                        type: 'string',
                        description: 'The file uri to the Llamafile.'
                    },
                    port: {
                        type: 'number',
                        description: 'The port to use to start the server.'
                    }
                }
            }
        }
    }
};

export function bindAILlamafilePreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: aiLlamafilePreferencesSchema });
}
