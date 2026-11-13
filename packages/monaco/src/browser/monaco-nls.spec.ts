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

import { expect } from 'chai';
import { nls } from '@theia/core/lib/common/nls';
import { getNLSLanguage, getNLSMessages, localize, localize2 } from './monaco-nls.js';

interface NlsGlobals {
    _VSCODE_NLS_MESSAGES?: string[];
    _VSCODE_NLS_LANGUAGE?: string;
}

/**
 * @monaco-uplift
 *
 * `monaco-nls.ts` replaces Monaco's `vs/nls` module in the bundle, so it must keep providing the exports of that module.
 */
describe('monaco-nls', () => {

    // A string that exists in the VS Code language packs, and one that does not.
    const vscodeString = 'Find';
    const unknownString = 'A string that VS Code does not translate';

    const original = { locale: nls.locale, localization: nls.localization };

    function useGerman(): void {
        Object.assign(nls, {
            locale: 'de',
            localization: { languageId: 'de', translations: { [nls.getDefaultKey(vscodeString)]: 'Suchen' } }
        });
    }

    afterEach(() => {
        Object.assign(nls, original);
        delete (globalThis as NlsGlobals)._VSCODE_NLS_MESSAGES;
        delete (globalThis as NlsGlobals)._VSCODE_NLS_LANGUAGE;
    });

    it('returns the English string and inserts the arguments if no locale is set', () => {
        expect(localize('key', 'Found {0} of {1}', 1, 'many')).to.equal('Found 1 of many');
        expect(localize2('key', 'Found {0} of {1}', 1, 'many')).to.deep.equal({ original: 'Found 1 of many', value: 'Found 1 of many' });
    });

    it('translates a string of the VS Code language packs by its default value, ignoring the Monaco key', () => {
        useGerman();
        expect(localize('anyMonacoKey', vscodeString)).to.equal('Suchen');
        expect(localize2('anyMonacoKey', vscodeString)).to.deep.equal({ original: vscodeString, value: 'Suchen' });
    });

    it('falls back to English for a string without a translation', () => {
        useGerman();
        expect(localize('key', unknownString)).to.equal(unknownString);
        expect(localize2('key', unknownString)).to.deep.equal({ original: unknownString, value: unknownString });
    });

    it('reads the NLS messages and language from the globals', () => {
        expect(getNLSMessages()).to.be.undefined;
        expect(getNLSLanguage()).to.be.undefined;
        Object.assign(globalThis, { _VSCODE_NLS_MESSAGES: ['message'], _VSCODE_NLS_LANGUAGE: 'de' });
        expect(getNLSMessages()).to.deep.equal(['message']);
        expect(getNLSLanguage()).to.equal('de');
    });
});
