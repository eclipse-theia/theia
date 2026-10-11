// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import {
    buildChangeTreeRows, ChangeTreeFileRow, ChangeTreeRow, filterRefsForBadges, getFileName, getRefBadgePresentation, getRefColorIndex
} from './scm-history-graph-helpers';
import { ScmHistoryItemChange, ScmHistoryItemRef, ScmHistoryProvider } from './scm-provider';

describe('getRefColorIndex', () => {

    const mainRef: ScmHistoryItemRef = { id: 'refs/heads/main', name: 'main' };
    const remoteRef: ScmHistoryItemRef = { id: 'refs/remotes/origin/main', name: 'origin/main' };
    const baseRef: ScmHistoryItemRef = { id: 'refs/remotes/origin/develop', name: 'origin/develop' };
    const otherRef: ScmHistoryItemRef = { id: 'refs/heads/feature', name: 'feature' };

    const provider = {
        currentHistoryItemRef: mainRef,
        currentHistoryItemRemoteRef: remoteRef,
        currentHistoryItemBaseRef: baseRef,
    } as ScmHistoryProvider;

    it('returns 0 for the current history item ref', () => {
        expect(getRefColorIndex(mainRef, provider)).to.equal(0);
    });

    it('returns 1 for the current remote ref', () => {
        expect(getRefColorIndex(remoteRef, provider)).to.equal(1);
    });

    it('returns 2 for the current base ref', () => {
        expect(getRefColorIndex(baseRef, provider)).to.equal(2);
    });

    it('returns undefined for any other ref', () => {
        expect(getRefColorIndex(otherRef, provider)).to.be.undefined;
    });

    it('returns undefined without a provider', () => {
        expect(getRefColorIndex(mainRef, undefined)).to.be.undefined;
    });
});

describe('getRefBadgePresentation', () => {

    const mainRef: ScmHistoryItemRef = { id: 'refs/heads/main', name: 'main' };
    const remoteRef: ScmHistoryItemRef = { id: 'refs/remotes/origin/main', name: 'origin/main' };

    const provider = {
        currentHistoryItemRef: mainRef,
        currentHistoryItemRemoteRef: remoteRef,
    } as ScmHistoryProvider;

    it('prefers the codicon icon transferred from the provider', () => {
        const ref: ScmHistoryItemRef = { ...mainRef, icon: 'codicon codicon-target' };
        expect(getRefBadgePresentation(ref, undefined).iconClass).to.equal('codicon-target');
    });

    it('falls back to the target icon for the current ref', () => {
        expect(getRefBadgePresentation(mainRef, provider).iconClass).to.equal('codicon-target');
    });

    it('falls back to category icons for remote, tag, and other local refs', () => {
        expect(getRefBadgePresentation(remoteRef, provider).iconClass).to.equal('codicon-cloud');
        expect(getRefBadgePresentation({ id: 'refs/tags/v1', name: 'v1' }, provider).iconClass).to.equal('codicon-tag');
        expect(getRefBadgePresentation({ id: 'refs/heads/feature', name: 'feature' }, provider).iconClass).to.equal('codicon-git-branch');
    });

    it('carries the ref color index', () => {
        expect(getRefBadgePresentation(mainRef, provider).colorIndex).to.equal(0);
        expect(getRefBadgePresentation(remoteRef, provider).colorIndex).to.equal(1);
        expect(getRefBadgePresentation({ id: 'refs/heads/feature', name: 'feature' }, provider).colorIndex).to.be.undefined;
    });
});

describe('filterRefsForBadges', () => {

    const mainRef: ScmHistoryItemRef = { id: 'refs/heads/main', name: 'main' };
    const remoteRef: ScmHistoryItemRef = { id: 'refs/remotes/origin/main', name: 'origin/main' };
    const featureRef: ScmHistoryItemRef = { id: 'refs/heads/feature', name: 'feature' };
    const refs = [mainRef, remoteRef, featureRef];

    const provider = {
        currentHistoryItemRef: mainRef,
        currentHistoryItemRemoteRef: remoteRef,
    } as ScmHistoryProvider;

    it("returns all refs in 'all' mode", () => {
        expect(filterRefsForBadges(refs, provider, 'all')).to.deep.equal(refs);
    });

    it("keeps only the refs used as a filter in 'filter' mode", () => {
        expect(filterRefsForBadges(refs, provider, 'filter')).to.deep.equal([mainRef, remoteRef]);
    });

    it("returns all refs in 'filter' mode when no provider is available", () => {
        expect(filterRefsForBadges(refs, undefined, 'filter')).to.deep.equal(refs);
    });

    it("keeps only the explicitly picked refs in 'filter' mode with an explicit filter", () => {
        expect(filterRefsForBadges(refs, provider, 'filter', ['refs/heads/feature'])).to.deep.equal([featureRef]);
    });

    it("ignores an explicit filter in 'all' mode", () => {
        expect(filterRefsForBadges(refs, provider, 'all', ['refs/heads/feature'])).to.deep.equal(refs);
    });
});

describe('buildChangeTreeRows', () => {

    const rootUri = 'file:///repo';

    function change(path: string): ScmHistoryItemChange {
        return { uri: `${rootUri}/${path}`, modifiedUri: `${rootUri}/${path}` };
    }

    /** Renders the rows as indented lines, so the expectations read like a tree. */
    function describeRows(rows: readonly ChangeTreeRow[]): string[] {
        return rows.map(row => `${'  '.repeat(row.depth)}${row.type === 'folder' ? row.label + '/' : getFileName(row.path)}`);
    }

    it('keeps files at the root at depth 0', () => {
        const rows = buildChangeTreeRows([change('a.ts'), change('b.ts')], rootUri, new Set());
        expect(describeRows(rows)).to.deep.equal(['a.ts', 'b.ts']);
    });

    it('groups files under their folder', () => {
        const rows = buildChangeTreeRows([change('src/a.ts'), change('src/b.ts')], rootUri, new Set());
        expect(describeRows(rows)).to.deep.equal(['src/', '  a.ts', '  b.ts']);
    });

    it('compacts folder chains that hold a single child folder', () => {
        const rows = buildChangeTreeRows([change('src/browser/a.ts')], rootUri, new Set());
        expect(describeRows(rows)).to.deep.equal(['src/browser/', '  a.ts']);
    });

    it('stops compacting where a folder chain branches', () => {
        const rows = buildChangeTreeRows([change('src/browser/a.ts'), change('src/node/b.ts')], rootUri, new Set());
        expect(describeRows(rows)).to.deep.equal(['src/', '  browser/', '    a.ts', '  node/', '    b.ts']);
    });

    it('does not compact a folder that also holds files', () => {
        const rows = buildChangeTreeRows([change('src/a.ts'), change('src/browser/b.ts')], rootUri, new Set());
        expect(describeRows(rows)).to.deep.equal(['src/', '  browser/', '    b.ts', '  a.ts']);
    });

    it('sorts folders before files, each alphabetically', () => {
        const rows = buildChangeTreeRows([change('z.ts'), change('a.ts'), change('src/b.ts')], rootUri, new Set());
        expect(describeRows(rows)).to.deep.equal(['src/', '  b.ts', 'a.ts', 'z.ts']);
    });

    it('hides the descendants of a collapsed folder', () => {
        const rows = buildChangeTreeRows([change('src/a.ts'), change('b.ts')], rootUri, new Set(['src']));
        expect(describeRows(rows)).to.deep.equal(['src/', 'b.ts']);
    });

    it('addresses a compacted folder by its full path', () => {
        const rows = buildChangeTreeRows([change('src/browser/a.ts')], rootUri, new Set(['src/browser']));
        expect(describeRows(rows)).to.deep.equal(['src/browser/']);
    });

    it('carries the original change on each file row', () => {
        const first = change('src/a.ts');
        const rows = buildChangeTreeRows([first], rootUri, new Set());
        expect(rows[1].type).to.equal('file');
        expect((rows[1] as ChangeTreeFileRow).change).to.equal(first);
    });

    it('keeps the index of the change in the original list, so row keys stay stable', () => {
        const rows = buildChangeTreeRows([change('z.ts'), change('src/a.ts')], rootUri, new Set());
        // Sorted as: src/, src/a.ts (index 1), z.ts (index 0).
        expect(rows.filter(row => row.type === 'file').map(row => (row as ChangeTreeFileRow).index)).to.deep.equal([1, 0]);
    });

    it('falls back to the full path when the change is outside the repository root', () => {
        const outside: ScmHistoryItemChange = { uri: 'file:///elsewhere/x.ts', modifiedUri: 'file:///elsewhere/x.ts' };
        const rows = buildChangeTreeRows([outside], rootUri, new Set());
        expect(describeRows(rows)).to.deep.equal(['elsewhere/', '  x.ts']);
    });
});
