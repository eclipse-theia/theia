/********************************************************************************
 * Copyright (C) 2019 Xuye Cai and others.
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

// copied from vscode: https://github.com/Microsoft/vscode/blob/master/src/vs/base/node/encoding.ts
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const jschardet = require('jschardet');
const MINIMUM_THRESHOLD = 0.2;
jschardet.Constants.MINIMUM_THRESHOLD = MINIMUM_THRESHOLD;

export namespace EncodingUtil {
    const IGNORE_ENCODINGS = ['ascii', 'utf-8', 'utf-16', 'utf-32'];
    export async function guessEncodingByBuffer(buffer: Buffer): Promise<string | undefined> {
        const guessed = jschardet.detect(buffer);
        if (!guessed || !guessed.encoding) {
            return undefined;
        }
        const enc = guessed.encoding.toLowerCase();
        // Ignore encodings that cannot guess correctly
        // (http://chardet.readthedocs.io/en/latest/supported-encodings.html)
        if (0 <= IGNORE_ENCODINGS.indexOf(enc)) {
            return undefined;
        }
        return toIconvLiteEncoding(guessed.encoding);
    }

    function toIconvLiteEncoding(encodingName: string): string {
        const normalizedEncodingName = encodingName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];

        return mapped || normalizedEncodingName;
    }

    const JSCHARDET_TO_ICONV_ENCODINGS: { [name: string]: string } = {
        'ibm866': 'cp866',
        'big5': 'cp950'
    };
}
