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
            description: nls.localizeByDefault('Controls whether opened editors show as preview editors. Preview editors do not stay open, are reused until explicitly set to be kept open (via double-click or editing), and show file names in italics.'),
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
