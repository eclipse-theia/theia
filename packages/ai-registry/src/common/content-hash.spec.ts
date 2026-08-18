// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { computeContentHash, FileContent } from './content-hash';

function file(relativePath: string, content: string): FileContent {
    return { relativePath, content: new TextEncoder().encode(content) };
}

describe('computeContentHash', () => {

    it('hashes an empty file set to the sha256-of-nothing 12-char prefix', () => {
        // sha256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        expect(computeContentHash([])).to.equal('e3b0c44298fc');
    });

    it('produces a 12-character lowercase hex prefix', () => {
        const hash = computeContentHash([file('SKILL.md', '# Example')]);
        expect(hash).to.match(/^[0-9a-f]{12}$/);
    });

    it('is independent of the input order (paths are sorted lexicographically)', () => {
        const a = computeContentHash([file('a.txt', 'A'), file('b.txt', 'B'), file('c/d.txt', 'D')]);
        const b = computeContentHash([file('c/d.txt', 'D'), file('b.txt', 'B'), file('a.txt', 'A')]);
        expect(a).to.equal(b);
    });

    it('excludes dot-prefixed files at the root (e.g. the .registry.json registry metadata file)', () => {
        const withoutMetadata = computeContentHash([file('SKILL.md', '# Example')]);
        const withMetadata = computeContentHash([
            file('SKILL.md', '# Example'),
            file('.registry.json', '{"skillId":"x"}')
        ]);
        expect(withMetadata).to.equal(withoutMetadata);
    });

    it('excludes files inside dot-prefixed directories at any level', () => {
        const baseline = computeContentHash([file('SKILL.md', '# Example')]);
        const withHidden = computeContentHash([
            file('SKILL.md', '# Example'),
            file('.git/config', 'ignored'),
            file('docs/.hidden/note.txt', 'ignored')
        ]);
        expect(withHidden).to.equal(baseline);
    });

    it('excludes the empty set and a dot-only set identically', () => {
        expect(computeContentHash([file('.registry.json', '{}')])).to.equal(computeContentHash([]));
    });

    it('normalises backslash separators to POSIX so Windows and Linux backends agree', () => {
        const windows = computeContentHash([file('docs\\guide.md', 'content')]);
        const posix = computeContentHash([file('docs/guide.md', 'content')]);
        expect(windows).to.equal(posix);
    });

    it('changes when a file path changes', () => {
        const first = computeContentHash([file('SKILL.md', 'same')]);
        const renamed = computeContentHash([file('OTHER.md', 'same')]);
        expect(first).to.not.equal(renamed);
    });

    it('changes when file content changes', () => {
        const first = computeContentHash([file('SKILL.md', 'one')]);
        const second = computeContentHash([file('SKILL.md', 'two')]);
        expect(first).to.not.equal(second);
    });
});
