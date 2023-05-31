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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Range } from 'vscode-languageserver-protocol';
import { isNumber, isObject, isString, isUndefined } from './types';

export interface TextDocumentContentChangeDelta {
    readonly range: Range;
    readonly rangeLength?: number;
    readonly text: string;
}
export namespace TextDocumentContentChangeDelta {

    export function is(arg: unknown): arg is TextDocumentContentChangeDelta {
        return isObject<TextDocumentContentChangeDelta>(arg)
            && isString(arg.text)
            && (isNumber(arg.rangeLength) || isUndefined(arg.rangeLength))
            && Range.is(arg.range);
    }

}
