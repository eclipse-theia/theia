// *****************************************************************************
// Copyright (C) 2018 Google and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export const EditorPreviewConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'editor.enablePreview': {
            type: 'boolean',
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault("Controls whether preview mode is used when editors open. There is a maximum of one preview mode editor per editor group. This editor displays its filename in italics on its tab or title label and in the Open Editors view. Its contents will be replaced by the next editor opened in preview mode. Making a change in a preview mode editor will persist it, as will a double-click on its label, or the 'Keep Open' option in its label context menu. Opening a file from Explorer with a double-click persists its editor immediately."),
            default: true
        },
    }
};

export interface EditorPreviewConfiguration {
    'editor.enablePreview': boolean;
}

export const EditorPreviewPreferenceContribution = Symbol('EditorPreviewPreferenceContribution');
export const EditorPreviewPreferences = Symbol('EditorPreviewPreferences');
export type EditorPreviewPreferences = PreferenceProxy<EditorPreviewConfiguration>;

export function createEditorPreviewPreferences(preferences: PreferenceService, schema: PreferenceSchema = EditorPreviewConfigSchema): EditorPreviewPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindEditorPreviewPreferences(bind: interfaces.Bind): void {
    bind(EditorPreviewPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(EditorPreviewPreferenceContribution);
        return createEditorPreviewPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(EditorPreviewPreferenceContribution).toConstantValue({ schema: EditorPreviewConfigSchema });
    bind(PreferenceContribution).toService(EditorPreviewPreferenceContribution);
}
