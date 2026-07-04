// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { readGrammarFromDisk, isValidGrammarContribution } from '../read-grammars';

describe('readGrammarFromDisk', () => {

    let pluginRoot: string;

    beforeEach(async () => {
        pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'read-grammars-'));
    });

    afterEach(async () => {
        await fs.remove(pluginRoot);
    });

    it('inlines JSON grammar file content', async () => {
        await fs.writeJson(path.join(pluginRoot, 'sample.tmLanguage.json'), { scopeName: 'source.sample' });

        const grammar = await readGrammarFromDisk({
            language: 'sample',
            scopeName: 'source.sample',
            path: './sample.tmLanguage.json'
        }, pluginRoot);

        expect(grammar).to.deep.equal({
            language: 'sample',
            scope: 'source.sample',
            format: 'json',
            grammar: { scopeName: 'source.sample' },
            grammarLocation: './sample.tmLanguage.json',
            injectTo: undefined,
            embeddedLanguages: undefined,
            tokenTypes: undefined
        });
    });

    it('reads plist grammar files as text', async () => {
        const plist = '<?xml version="1.0"?><plist/>';
        await fs.writeFile(path.join(pluginRoot, 'sample.tmLanguage'), plist);

        const grammar = await readGrammarFromDisk({
            scopeName: 'source.sample',
            path: './sample.tmLanguage'
        }, pluginRoot);

        expect(grammar!.format).to.equal('plist');
        expect(grammar!.grammar).to.equal(plist);
    });

    it('returns undefined for invalid manifest fields', async () => {
        await fs.writeJson(path.join(pluginRoot, 'sample.tmLanguage.json'), { scopeName: 'source.sample' });

        expect(await readGrammarFromDisk({
            scopeName: '',
            path: './sample.tmLanguage.json'
        }, pluginRoot)).to.equal(undefined);

        expect(await readGrammarFromDisk({
            scopeName: 'source.sample',
            path: ''
        }, pluginRoot)).to.equal(undefined);

        expect(await readGrammarFromDisk({
            scopeName: 'source.sample',
            path: './sample.tmLanguage.json',
            injectTo: 'text.html.basic' as unknown as string[]
        }, pluginRoot)).to.equal(undefined);
    });

    it('rejects grammar paths outside the plugin directory', async () => {
        expect(isValidGrammarContribution({
            scopeName: 'source.sample',
            path: '../outside.tmLanguage.json'
        }, pluginRoot)).to.equal(false);
    });
});
