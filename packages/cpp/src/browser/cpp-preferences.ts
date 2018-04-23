/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PreferenceSchema, PreferenceProxy, PreferenceService, createPreferenceProxy, PreferenceContribution } from "@theia/core/lib/browser/preferences";
import { interfaces } from "inversify";
import { CppBuildConfiguration } from "./cpp-build-configurations";

export const cppPreferencesSchema: PreferenceSchema = {
    type: "object",
    properties: {
        "cpp.buildConfigurations": {
            description: "List of build configurations",
            type: "array",
            items: {
                type: "object",
                properties: {
                    "name": {
                        type: "string"
                    },
                    "directory": {
                        type: "string"
                    }
                },
                required: ["name", "directory"],
            }
        }
    }
};

export class CppConfiguration {
    "cpp.buildConfigurations": CppBuildConfiguration[];
}

export const CppPreferences = Symbol("CppPreferences");
export type CppPreferences = PreferenceProxy<CppConfiguration>;

export function createCppPreferences(preferences: PreferenceService): CppPreferences {
    return createPreferenceProxy(preferences, cppPreferencesSchema);
}

export function bindCppPreferences(bind: interfaces.Bind): void {
    bind(CppPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createCppPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: cppPreferencesSchema });
}
