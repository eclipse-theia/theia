// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { findSubstringIndex, hasPrefixMatch, hasSubstringMatch, matchRank } from './fuzzy-match-utils';

describe('fuzzy-match-utils', () => {

    describe('#findSubstringIndex', () => {

        it('should return the index of a case-insensitive substring match', () => {
            expect(findSubstringIndex('fontSize', 'font')).to.equal(0);
            expect(findSubstringIndex('setFont', 'font')).to.equal(3);
        });

        it('should be case-insensitive', () => {
            expect(findSubstringIndex('FontSize', 'font')).to.equal(0);
            expect(findSubstringIndex('fontSize', 'Font')).to.equal(0);
        });

        it('should return -1 when pattern is not a substring', () => {
            expect(findSubstringIndex('reformatting', 'font')).to.equal(-1);
        });

        it('should return 0 for empty pattern', () => {
            expect(findSubstringIndex('anything', '')).to.equal(0);
        });

    });

    describe('#hasSubstringMatch', () => {

        it('should return true for exact substring match', () => {
            expect(hasSubstringMatch('fontSize', 'font')).to.be.true;
        });

        it('should be case-insensitive', () => {
            expect(hasSubstringMatch('FontSize', 'font')).to.be.true;
            expect(hasSubstringMatch('fontSize', 'Font')).to.be.true;
        });

        it('should return false when pattern is not a substring', () => {
            expect(hasSubstringMatch('reformatting', 'font')).to.be.false;
        });

        it('should return true for empty pattern', () => {
            expect(hasSubstringMatch('anything', '')).to.be.true;
        });

        it('should return true when text equals pattern', () => {
            expect(hasSubstringMatch('font', 'font')).to.be.true;
        });

    });

    describe('#hasPrefixMatch', () => {

        it('should match simple prefix', () => {
            expect(hasPrefixMatch('fontSize', 'font')).to.be.true;
        });

        it('should match segmented prefix across punctuation', () => {
            expect(hasPrefixMatch('workspace-server', 'works-ser')).to.be.true;
        });

        it('should match when query parts skip segments', () => {
            expect(hasPrefixMatch('workspace-backend-service', 'works-ser')).to.be.true;
        });

        it('should not match when first segment does not match', () => {
            expect(hasPrefixMatch('backend-workspace-service', 'works-ser')).to.be.false;
        });

        it('should be case-insensitive', () => {
            expect(hasPrefixMatch('WorkspaceServer', 'work')).to.be.true;
        });

        it('should return true for empty pattern', () => {
            expect(hasPrefixMatch('anything', '')).to.be.true;
        });

        it('should handle various separators', () => {
            expect(hasPrefixMatch('workspace_server', 'works_ser')).to.be.true;
            expect(hasPrefixMatch('workspace.server.ts', 'works.ser')).to.be.true;
            expect(hasPrefixMatch('workspace/server', 'works/ser')).to.be.true;
        });

        it('should not match when query parts are out of order', () => {
            expect(hasPrefixMatch('service-workspace', 'works-ser')).to.be.false;
        });

        it('should return true when pattern is only separators', () => {
            expect(hasPrefixMatch('anything', '---')).to.be.true;
        });

        it('should return false when text is only separators', () => {
            expect(hasPrefixMatch('---', 'abc')).to.be.false;
        });

        it('should not match when a later query part has no matching segment', () => {
            expect(hasPrefixMatch('workspace-server', 'works-zzz')).to.be.false;
        });

    });

    describe('#matchRank', () => {

        it('should return 0 for prefix matches', () => {
            expect(matchRank('fontSize', 'font')).to.equal(0);
            expect(matchRank('workspace-server', 'works-ser')).to.equal(0);
        });

        it('should return 1 for substring (non-prefix) matches', () => {
            expect(matchRank('setFont', 'font')).to.equal(1);
            expect(matchRank('base.tsconfig.json', 'con')).to.equal(1);
        });

        it('should return 2 for fuzzy-only matches', () => {
            expect(matchRank('baconing', 'bcn')).to.equal(2);
        });

        it('should return 0 for empty pattern', () => {
            expect(matchRank('anything', '')).to.equal(0);
        });

    });

});
