// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { middleTruncatePath, splitRepoRelativePath } from '../browser/qaap-diff-review-path';

describe('splitRepoRelativePath', () => {
    it('splits directory and basename', () => {
        expect(splitRepoRelativePath('src/foo/bar.ts')).to.deep.equal({
            base: 'bar.ts',
            dir: 'src/foo',
        });
    });

    it('handles root-level files', () => {
        expect(splitRepoRelativePath('README.md')).to.deep.equal({
            base: 'README.md',
            dir: '',
        });
    });
});

describe('middleTruncatePath', () => {
    it('leaves short paths unchanged', () => {
        expect(middleTruncatePath('src/a.ts', 40)).to.equal('src/a.ts');
    });

    it('truncates long paths in the middle', () => {
        const path = 'packages/qaap-mobile-shell/src/browser/mobile-projects-panel.ts';
        const out = middleTruncatePath(path, 30);
        expect(out.length).to.be.at.most(30);
        expect(out).to.include('…');
    });
});
