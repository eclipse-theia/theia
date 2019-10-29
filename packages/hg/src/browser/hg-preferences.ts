/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const HgConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'hg.decorations.enabled': {
            'type': 'boolean',
            'description': 'Show Hg file status in the navigator.',
            'default': true
        },
        'hg.decorations.colors': {
            'type': 'boolean',
            'description': 'Use color decoration in the navigator.',
            'default': false
        },
        'hg.editor.decorations.enabled': {
            'type': 'boolean',
            'description': 'Show hg decorations in the editor.',
            'default': true
        },
        'hg.editor.dirtyDiff.linesLimit': {
            'type': 'number',
            'description': 'Do not show dirty diff decorations, if editor\'s line count exceeds this limit.',
            'default': 1000
        }
    }
};

export interface HgConfiguration {
    'hg.decorations.enabled': boolean,
    'hg.decorations.colors': boolean,
    'hg.editor.decorations.enabled': boolean,
    'hg.editor.dirtyDiff.linesLimit': number,
}

export const HgPreferences = Symbol('HgPreferences');
export type HgPreferences = PreferenceProxy<HgConfiguration>;

export function createHgPreferences(preferences: PreferenceService): HgPreferences {
    return createPreferenceProxy(preferences, HgConfigSchema);
}

export function bindHgPreferences(bind: interfaces.Bind): void {
    bind(HgPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createHgPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: HgConfigSchema });
}
