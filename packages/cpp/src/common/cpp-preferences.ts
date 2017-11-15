/*
 * Copyright (C) 2017 Ericsson and others.
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
} from '@theia/preferences/lib/common';

export const CppConfigSchema: PreferenceSchema = {
    "type": "object",
    "properties": {
        "cpp.clangdCompileCommandsPath": {
            "type": "string",
            "description": "clangd path for compile_commands.json"
        },
        "cpp.clangdPath": {
            "type": "string",
            "description": "Literal command to start Clangd with. Can contain any relative or absolute path to clangd executable."
        },
        "cpp.clangdCommandArgs": {
            "type": "string",
            "description": "Literal command to start Clangd with. Can contain any relative or absolute path to clangd executable."
        }
    }
}

export interface CppConfiguration {
    'cpp.clangdCompileCommandsPath': string,
    'cpp.clangdPath': string
}

export const defaultCppConfiguration: CppConfiguration = {
    'cpp.clangdCompileCommandsPath': "-compile-commands-dir=/home/ewilenr/theiaEclipse/eclipse/git/llvm/build",
    'cpp.clangdPath': "/home/ewilenr/theiaEclipse/eclipse/git/llvm/build/bin/compile_commands.json"
}

export const CppPreferences = Symbol('CppPreferences');
export type CppPreferences = PreferenceProxy<CppConfiguration>;

export function createCppPreferences(preferences: PreferenceService): CppPreferences {
    return createPreferenceProxy(preferences, defaultCppConfiguration, CppConfigSchema);
}

export function bindCppPreferences(bind: interfaces.Bind): void {
    bind(CppPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get(PreferenceService);
        return createCppPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({ schema: CppConfigSchema });
}
