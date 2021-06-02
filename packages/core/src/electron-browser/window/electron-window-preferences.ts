/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
import { createPreferenceProxy, PreferenceContribution, PreferenceProxy, PreferenceSchema, PreferenceService } from '../../browser/preferences';

export namespace ZoomLevel {
    export const DEFAULT = 0;
    // copied from https://github.com/microsoft/vscode/blob/dda96b69bfc63f309e60cfc5f98cb863c46b32ac/src/vs/workbench/electron-sandbox/actions/windowActions.ts#L47-L48
    export const MIN = -8;
    export const MAX = 9;
    // amount to increment or decrement the window zoom level.
    export const VARIATION = 0.5;
}

export const electronWindowPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'window.zoomLevel': {
            'type': 'number',
            'default': ZoomLevel.DEFAULT,
            'minimum': ZoomLevel.MIN,
            'maximum': ZoomLevel.MAX,
            'scope': 'application',
            // eslint-disable-next-line max-len
            'description': 'Adjust the zoom level of the window. The original size is 0 and each increment above (e.g. 1.0) or below (e.g. -1.0) represents zooming 20% larger or smaller. You can also enter decimals to adjust the zoom level with a finer granularity.'
        },
    }
};

export class ElectronWindowConfiguration {
    'window.zoomLevel': number;
}

export const ElectronWindowPreferences = Symbol('ElectronWindowPreferences');
export type ElectronWindowPreferences = PreferenceProxy<ElectronWindowConfiguration>;

export function createElectronWindowPreferences(preferences: PreferenceService): ElectronWindowPreferences {
    return createPreferenceProxy(preferences, electronWindowPreferencesSchema);
}

export function bindWindowPreferences(bind: interfaces.Bind): void {
    bind(ElectronWindowPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createElectronWindowPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: electronWindowPreferencesSchema });
}
