/********************************************************************************
 * Copyright (C) 2018 Google and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { interfaces } from '@theia/core/shared/inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const EditorPreviewConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'editor.enablePreview': {
            type: 'boolean',
            description: 'Controls whether editors are opened as previews when selected or single-clicked.',
            default: true
        },
    }
};

export interface EditorPreviewConfiguration {
    'editor.enablePreview': boolean;
}

export const EditorPreviewPreferences = Symbol('EditorPreviewPreferences');
export type EditorPreviewPreferences = PreferenceProxy<EditorPreviewConfiguration>;

export function createEditorPreviewPreferences(preferences: PreferenceService): EditorPreviewPreferences {
    return createPreferenceProxy(preferences, EditorPreviewConfigSchema);
}

export function bindEditorPreviewPreferences(bind: interfaces.Bind): void {
    bind(EditorPreviewPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createEditorPreviewPreferences(preferences);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: EditorPreviewConfigSchema });
}
