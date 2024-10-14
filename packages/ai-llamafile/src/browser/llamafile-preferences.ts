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
            markdownDescription: '❗ This setting allows you to add llamafiles.\
            \n\
            You need to provide a user friendly `name`, the file `uri` to the llamafile and the `port` to use.\
            \n\
            In order to start your llamafile you have to call the "Start Llamafile" command where you can then select the llamafile to start.\
            \n\
            If you modify an entry, e.g. change the port and the server was already running, then it will be stopped and you have to manually start it again.',
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
