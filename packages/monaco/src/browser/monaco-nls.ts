// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

/**
 * Drop-in replacement for `@theia/monaco-editor-core/esm/vs/nls` that plugs
 * Theia's localization system into every Monaco `localize` / `localize2` call.
 *
 * Webpack resolves the original module to this file via `resolve.alias` (see
 * `webpack-generator.ts`). We import from `nls.messages` directly so the alias
 * does not create a circular reference.
 *
 * The Monaco editor web worker (`editor.worker.js`) is built in a separate
 * webpack config without this alias, so it continues to use the original
 * `nls.js` module and is not affected.
 */

// Re-export the message store — imported via a path that is NOT aliased.
export { getNLSLanguage, getNLSMessages } from '@theia/monaco-editor-core/esm/vs/nls.messages';

import { nls } from '@theia/core/lib/common/nls';
import { FormatType, Localization } from '@theia/core/lib/common/i18n/localization';

// Duplicate the interface declarations from the original nls module so that
// consumers get the same types without importing from the aliased path.
export interface ILocalizeInfo {
    key: string;
    comment: string[];
}

export interface ILocalizedString {
    original: string;
    value: string;
}

function theiaLocalize(label: string, ...args: FormatType[]): ILocalizedString {
    const original = Localization.format(label, args);
    if (nls.locale) {
        const defaultKey = nls.getDefaultKey(label);
        if (defaultKey) {
            return {
                original,
                value: nls.localize(defaultKey, label, ...args)
            };
        }
    }
    return {
        original,
        value: original
    };
}

export function localize(_key: string, label: string, ...args: FormatType[]): string {
    return theiaLocalize(label, ...args).value;
}

export function localize2(_key: string, label: string, ...args: FormatType[]): ILocalizedString {
    return theiaLocalize(label, ...args);
}
