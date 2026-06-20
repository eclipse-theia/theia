// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { generateCommandPatterns, flattenSuggestions, PatternSuggestion } from './shell-command-patterns';

/** Helper to extract just the patterns arrays for concise assertions. */
function patternsOf(suggestions: PatternSuggestion[]): string[][] {
    return suggestions.map(s => s.patterns);
}

describe('generateCommandPatterns', () => {

    describe('single sub-command', () => {
        it('returns exact match only for a single-word command', () => {
            expect(patternsOf(generateCommandPatterns(['ls']))).to.deep.equal([['ls']]);
        });

        it('returns first-word prefix and exact for a two-word command', () => {
            expect(patternsOf(generateCommandPatterns(['git log']))).to.deep.equal([
                ['git *'], ['git log']
            ]);
        });

        it('returns first-word prefix, two-word prefix, and exact for a three-word command', () => {
            expect(patternsOf(generateCommandPatterns(['npm run test']))).to.deep.equal([
                ['npm *'], ['npm run *'], ['npm run test']
            ]);
        });

        it('returns first-word and two-word prefixes plus exact for a four-word command', () => {
            expect(patternsOf(generateCommandPatterns(['git log --oneline -20']))).to.deep.equal([
                ['git *'], ['git log *'], ['git log --oneline -20']
            ]);
        });

        it('omits exact match when command exceeds 50 characters', () => {
            const longCommand = 'git log --format="%H %an %ae" --since=2024-01-01 --until=2024-12-31';
            expect(longCommand.length).to.be.greaterThan(50);
            expect(patternsOf(generateCommandPatterns([longCommand]))).to.deep.equal([
                ['git *'], ['git log *']
            ]);
        });

        it('includes exact match at exactly 50 characters', () => {
            const command50 = 'git log --oneline --decorate --all --graph xxxxxxx';
            expect(command50.length).to.equal(50);
            expect(patternsOf(generateCommandPatterns([command50]))).to.deep.equal([
                ['git *'], ['git log *'], [command50]
            ]);
        });
    });

    describe('compound commands with shared first word', () => {
        it('returns only first-word prefix when sub-commands share first word but differ on second', () => {
            expect(patternsOf(generateCommandPatterns([
                'git rev-parse --show-toplevel',
                'git log -n 15 --oneline --decorate --no-color'
            ]))).to.deep.equal([['git *']]);
        });

        it('returns first-word and two-word prefix when sub-commands share first two words', () => {
            expect(patternsOf(generateCommandPatterns([
                'npm run build',
                'npm run test'
            ]))).to.deep.equal([['npm *'], ['npm run *']]);
        });

        it('never includes exact match for compound commands', () => {
            expect(patternsOf(generateCommandPatterns([
                'git status',
                'git log'
            ]))).to.deep.equal([['git *']]);
        });
    });

    describe('compound commands with combined first-word prefixes', () => {
        it('offers combined prefixes for two sub-commands with different first words', () => {
            expect(patternsOf(generateCommandPatterns([
                'git status',
                'npm test'
            ]))).to.deep.equal([['git *', 'npm *']]);
        });

        it('offers combined prefixes for piped commands', () => {
            expect(patternsOf(generateCommandPatterns([
                'find . -name "*.ts"',
                'head -5'
            ]))).to.deep.equal([['find *', 'head *']]);
        });

        it('uses exact command for single-word sub-command in combined suggestion', () => {
            expect(patternsOf(generateCommandPatterns([
                'sort',
                'find . -name "*.ts"'
            ]))).to.deep.equal([['sort', 'find *']]);
        });

        it('uses exact commands when both sub-commands are single words', () => {
            expect(patternsOf(generateCommandPatterns([
                'ls',
                'pwd'
            ]))).to.deep.equal([['ls', 'pwd']]);
        });

        it('does not offer combined for three or more sub-commands with different first words', () => {
            expect(patternsOf(generateCommandPatterns([
                'git status',
                'npm test',
                'cargo build'
            ]))).to.deep.equal([]);
        });
    });

    describe('edge cases', () => {
        it('returns empty array for empty input', () => {
            expect(generateCommandPatterns([])).to.deep.equal([]);
        });

        it('filters out empty strings in sub-commands', () => {
            expect(patternsOf(generateCommandPatterns(['', '  ', 'git log']))).to.deep.equal([
                ['git *'], ['git log']
            ]);
        });

        it('trims whitespace from sub-commands', () => {
            expect(patternsOf(generateCommandPatterns(['  git log  ']))).to.deep.equal([
                ['git *'], ['git log']
            ]);
        });

        it('uses exact command for single-word sub-command sharing first word in compound', () => {
            expect(patternsOf(generateCommandPatterns(['ls', 'ls -la']))).to.deep.equal([['ls', 'ls *']]);
        });

        it('handles sub-commands with special characters', () => {
            expect(patternsOf(generateCommandPatterns(['grep -r "pattern" ./src']))).to.deep.equal([
                ['grep *'], ['grep -r *'], ['grep -r "pattern" ./src']
            ]);
        });

        it('handles three sub-commands with shared prefix', () => {
            expect(patternsOf(generateCommandPatterns([
                'git add .',
                'git commit -m "msg"',
                'git push'
            ]))).to.deep.equal([['git *']]);
        });
    });
});

describe('flattenSuggestions', () => {
    it('passes through single-pattern suggestions unchanged', () => {
        const input: PatternSuggestion[] = [
            { patterns: ['git *'] },
            { patterns: ['git log *'] }
        ];
        expect(patternsOf(flattenSuggestions(input))).to.deep.equal([
            ['git *'], ['git log *']
        ]);
    });

    it('splits combined suggestions into individual ones', () => {
        const input: PatternSuggestion[] = [
            { patterns: ['find *', 'head *'] }
        ];
        expect(patternsOf(flattenSuggestions(input))).to.deep.equal([
            ['find *'], ['head *']
        ]);
    });

    it('deduplicates patterns across suggestions', () => {
        const input: PatternSuggestion[] = [
            { patterns: ['git *'] },
            { patterns: ['git *', 'npm *'] }
        ];
        expect(patternsOf(flattenSuggestions(input))).to.deep.equal([
            ['git *'], ['npm *']
        ]);
    });

    it('returns empty array for empty input', () => {
        expect(flattenSuggestions([])).to.deep.equal([]);
    });
});
