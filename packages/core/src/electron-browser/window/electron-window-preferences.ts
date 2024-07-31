// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { interfaces } from 'inversify';
import { nls } from '../../common/nls';
import { createPreferenceProxy, PreferenceContribution, PreferenceProxy, PreferenceSchema, PreferenceService } from '../../browser/preferences';
import { isOSX, isWindows } from '../../common';

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
            'description': nls.localizeByDefault("Adjust the default zoom level for all windows. Each increment above `0` (e.g. `1`) or below (e.g. `-1`) represents zooming `20%` larger or smaller. You can also enter decimals to adjust the zoom level with a finer granularity. See {0} for configuring if the 'Zoom In' and 'Zoom Out' commands apply the zoom level to all windows or only the active window.")
        },
        'window.titleBarStyle': {
            type: 'string',
            enum: ['native', 'custom'],
            default: isWindows ? 'custom' : 'native',
            scope: 'application',
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Adjust the appearance of the window title bar to be native by the OS or custom. On Linux and Windows, this setting also affects the application and context menu appearances. Changes require a full restart to apply.'),
            included: !isOSX
        },
    }
};

export class ElectronWindowConfiguration {
    'window.zoomLevel': number;
    'window.titleBarStyle': 'native' | 'custom';
}

export const ElectronWindowPreferenceContribution = Symbol('ElectronWindowPreferenceContribution');
export const ElectronWindowPreferences = Symbol('ElectronWindowPreferences');
export type ElectronWindowPreferences = PreferenceProxy<ElectronWindowConfiguration>;

export function createElectronWindowPreferences(preferences: PreferenceService, schema: PreferenceSchema = electronWindowPreferencesSchema): ElectronWindowPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindWindowPreferences(bind: interfaces.Bind): void {
    bind(ElectronWindowPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(ElectronWindowPreferenceContribution);
        return createElectronWindowPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(ElectronWindowPreferenceContribution).toConstantValue({ schema: electronWindowPreferencesSchema });
    bind(PreferenceContribution).toService(ElectronWindowPreferenceContribution);
}
