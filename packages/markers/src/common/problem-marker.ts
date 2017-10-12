/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Marker } from './marker';
import { Diagnostic } from "vscode-languageserver-types";

export const PROBLEM_KIND = 'problem';

export interface ProblemMarker extends Marker<Diagnostic> {
    kind: 'problem';
}

export namespace ProblemMarker {
    export function is(node: Marker<object>): node is ProblemMarker {
        return 'kind' in node && node.kind === PROBLEM_KIND;
    }
}
