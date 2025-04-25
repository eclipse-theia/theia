// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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

import { Range } from 'vscode-languageserver-protocol';
import { CancellationToken } from './cancellation';
import URI from './uri';

/** Represents a textual diff. */
export interface Diff {
    readonly changes: readonly DetailedLineRangeMapping[];
}

export interface DetailedLineRangeMapping extends LineRangeMapping {
    readonly innerChanges?: readonly RangeMapping[];
}

export interface LineRangeMapping {
    readonly left: LineRange;
    readonly right: LineRange;
}

/** Represents a range of whole lines of text. */
export interface LineRange {
    /** A zero-based number of the start line. */
    readonly start: number;
    /** A zero-based number of the end line, exclusive. */
    readonly end: number;
}

export interface RangeMapping {
    readonly left: Range;
    readonly right: Range;
}

export const DiffComputer = Symbol('DiffComputer');

export interface DiffComputer {
    computeDiff(left: URI, right: URI, options?: DiffComputerOptions): Promise<Diff | undefined>;
}

export interface DiffComputerOptions {
    readonly cancellationToken?: CancellationToken;
}
