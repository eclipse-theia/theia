/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceService,
    PreferenceSchema
} from '@theia/preferences-api/lib/common';

export const gdbPreferenceSchema: PreferenceSchema = {
    "type": "object",
    "properties": {
        "gdb.command": {
            "description": "GDB executable path",
        },
        "gdb.args": {
            "description": "GDB arguments"
        }
    }
};

export interface GDBConfiguration {
    'gdb.command': string,
    'gdb.args': string
}
export const defaultGDBConfiguration: GDBConfiguration = {
    'gdb.command': 'gdb',
    'gdb.args': '-i=mi'
}

export const GDBPreferences = Symbol('GDBPreferences');
export type GDBPreferences = PreferenceProxy<GDBConfiguration>;

export function createGDBPreferences(preferences: PreferenceService): GDBPreferences {
    return createPreferenceProxy(preferences, defaultGDBConfiguration, gdbPreferenceSchema);
}

export function bindGDBPreferences(bind: interfaces.Bind): void {
    bind(GDBPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get(PreferenceService);
        return createGDBPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue(gdbPreferenceSchema);
}
