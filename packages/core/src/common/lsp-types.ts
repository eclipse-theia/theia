// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Range } from 'vscode-languageserver-protocol';

export interface TextDocumentContentChangeDelta {
    readonly range: Range;
    readonly rangeLength?: number;
    readonly text: string;
}
export namespace TextDocumentContentChangeDelta {

    export function is(arg: unknown): arg is TextDocumentContentChangeDelta {
        const changeDelta = arg as TextDocumentContentChangeDelta;
        return !!changeDelta
            && typeof changeDelta === 'object'
            && typeof changeDelta.text === 'string'
            && (typeof changeDelta.rangeLength === 'number' || typeof changeDelta.rangeLength === 'undefined')
            && Range.is(changeDelta.range);
    }

}
