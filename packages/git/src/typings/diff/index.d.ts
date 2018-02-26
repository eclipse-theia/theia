/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/// <reference types='diff'/>

declare module "mod" {
    module "diff" {
        function diffArrays(a: string[], b: string[]): IDiffArraysResult[];

        interface IArrayDiffResult {
            value: string[];
            count?: number;
            added?: boolean;
            removed?: boolean;
        }
    }
}