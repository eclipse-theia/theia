/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema
} from '@theia/preferences-api/lib/browser';

export const OutputConfigSchema: PreferenceSchema = {
    "type": "object",
    "properties": {
        "output.maxChannelHistory": {
            "type": "number",
            "description": "The maximum number of entries in an output channel."
        }
    }
};

export interface OutputConfiguration {
    'output.maxChannelHistory': number
}

export const defaultOutputConfiguration: OutputConfiguration = {
    'output.maxChannelHistory': 1000
};

export const OutputPreferences = Symbol('OutputPreferences');
export type OutputPreferences = PreferenceProxy<OutputConfiguration>;

export function createOutputPreferences(preferences: PreferenceService): OutputPreferences {
    return createPreferenceProxy(preferences, defaultOutputConfiguration, OutputConfigSchema);
}

export function bindOutputPreferences(bind: interfaces.Bind): void {
    bind(OutputPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createOutputPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({ schema: OutputConfigSchema });
}
