/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/editor/common/core/characterClassifier.ts

import { toUint8 } from './uint';

/**
 * A fast character classifier that uses a compact array for ASCII values.
 */
export class CharacterClassifier<T extends number> {
	/**
	 * Maintain a compact (fully initialized ASCII map for quickly classifying ASCII characters - used more often in code).
	 */
    protected _asciiMap: Uint8Array;

	/**
	 * The entire map (sparse array).
	 */
    protected _map: Map<number, number>;

    protected _defaultValue: number;

    constructor(_defaultValue: T) {
        const defaultValue = toUint8(_defaultValue);

        this._defaultValue = defaultValue;
        this._asciiMap = CharacterClassifier._createAsciiMap(defaultValue);
        this._map = new Map<number, number>();
    }

    private static _createAsciiMap(defaultValue: number): Uint8Array {
        const asciiMap: Uint8Array = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            asciiMap[i] = defaultValue;
        }
        return asciiMap;
    }

    public set(charCode: number, _value: T): void {
        const value = toUint8(_value);

        if (charCode >= 0 && charCode < 256) {
            this._asciiMap[charCode] = value;
        } else {
            this._map.set(charCode, value);
        }
    }

    public get(charCode: number): T {
        if (charCode >= 0 && charCode < 256) {
            return <T>this._asciiMap[charCode];
        } else {
            return <T>(this._map.get(charCode) || this._defaultValue);
        }
    }
}
