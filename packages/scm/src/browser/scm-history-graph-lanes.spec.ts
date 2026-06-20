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
import { computeGraphRows } from './scm-history-graph-lanes';

describe('computeGraphRows', () => {

    function lanes(commits: { id: string; parentIds?: string[] }[]): number[] {
        return computeGraphRows(commits).map(r => r.lane);
    }

    // -------------------------------------------------------------------------
    // Linear history
    // -------------------------------------------------------------------------
    describe('linear history', () => {
        const commits = [
            { id: 'C', parentIds: ['B'] },
            { id: 'B', parentIds: ['A'] },
            { id: 'A', parentIds: [] },
        ];

        it('all commits stay in lane 0', () => {
            expect(lanes(commits)).to.deep.equal([0, 0, 0]);
        });

        it('colors are all 0', () => {
            const rows = computeGraphRows(commits);
            expect(rows.map(r => r.color)).to.deep.equal([0, 0, 0]);
        });

        it('first parent same-lane continuation emits no separate edge (handled by commit line)', () => {
            const rows = computeGraphRows(commits);
            // Row 0 (C): first parent B is in the same lane — no edge emitted
            // Only pass-through edges from other lanes (none here) are emitted
            const edgesC = rows[0].edges.filter(e => e.fromLane === 0 && e.toLane === 0);
            expect(edgesC.length).to.equal(0);
        });

        it('root commit (A) emits no edges', () => {
            const rows = computeGraphRows(commits);
            expect(rows[2].edges).to.be.empty;
        });
    });

    // -------------------------------------------------------------------------
    // Single branch + merge
    // -------------------------------------------------------------------------
    describe('branch and merge', () => {
        //   M  ← merge commit (parents: D, E)
        //   |\
        //   D  E  ← two parallel commits
        //   |  |
        //   B  B  (same B — E's parent is B too)
        //    \ |
        //     B
        //     |
        //     A
        //
        // Topological order (newest first): M, D, E, B, A
        const commits = [
            { id: 'M', parentIds: ['D', 'E'] },
            { id: 'D', parentIds: ['B'] },
            { id: 'E', parentIds: ['B'] },
            { id: 'B', parentIds: ['A'] },
            { id: 'A', parentIds: [] },
        ];

        it('merge commit M is in lane 0', () => {
            expect(lanes(commits)[0]).to.equal(0);
        });

        it('D (first parent) stays in lane 0', () => {
            expect(lanes(commits)[1]).to.equal(0);
        });

        it('E (second parent) is in a different lane', () => {
            expect(lanes(commits)[2]).to.not.equal(0);
        });

        it('B and A eventually converge back to lane 0', () => {
            const ls = lanes(commits);
            // B must be in lane 0 (first parent chain)
            expect(ls[3]).to.equal(0);
            // A also stays in lane 0
            expect(ls[4]).to.equal(0);
        });

        it('M emits a branch-out edge for second parent E', () => {
            const rows = computeGraphRows(commits);
            const mEdges = rows[0].edges;
            // Branch-out: from commit lane 0 to E's new lane
            const branchOut = mEdges.filter(e => e.type === 'branch-out' && e.fromLane === 0);
            expect(branchOut.length).to.be.greaterThan(0);
        });

        it('M does not emit a merge-in edge (no existing lane converges into M)', () => {
            const rows = computeGraphRows(commits);
            const mEdges = rows[0].edges;
            const mergeIn = mEdges.filter(e => e.type === 'merge-in');
            expect(mergeIn.length).to.equal(0);
        });

        it('E emits a merge-in edge (E parent B is already in lane 0)', () => {
            const rows = computeGraphRows(commits);
            // E is at index 2, in lane 1; its parent B is already in lane 0.
            // merge-in edge: fromLane=0 (B's lane), toLane=1 (E's commit lane)
            const eRow = rows[2];
            const eEdges = eRow.edges;
            const mergeIn = eEdges.filter(e => e.type === 'merge-in' && e.fromLane === 0 && e.toLane === eRow.lane);
            expect(mergeIn.length).to.be.greaterThan(0);
        });
    });

    // -------------------------------------------------------------------------
    // Parallel independent branches
    // -------------------------------------------------------------------------
    describe('parallel independent branches', () => {
        // Two completely independent branches interleaved in the list.
        // Newest first: A2, B2, A1, B1
        // A2 and A1 are on one branch, B2 and B1 on another.
        const commits = [
            { id: 'A2', parentIds: ['A1'] },
            { id: 'B2', parentIds: ['B1'] },
            { id: 'A1', parentIds: [] },
            { id: 'B1', parentIds: [] },
        ];

        it('A2 is in lane 0', () => {
            expect(lanes(commits)[0]).to.equal(0);
        });

        it('B2 is in a different lane from A2', () => {
            const ls = lanes(commits);
            expect(ls[1]).to.not.equal(ls[0]);
        });

        it('A1 is in lane 0 (continues A2 branch)', () => {
            expect(lanes(commits)[2]).to.equal(0);
        });

        it('B1 continues in the same lane as B2', () => {
            const ls = lanes(commits);
            expect(ls[3]).to.equal(ls[1]);
        });
    });

    // -------------------------------------------------------------------------
    // Octopus merge (3 parents)
    // -------------------------------------------------------------------------
    describe('octopus merge', () => {
        // O merges P1, P2, P3
        // O, P1, P2, P3
        const commits = [
            { id: 'O', parentIds: ['P1', 'P2', 'P3'] },
            { id: 'P1', parentIds: [] },
            { id: 'P2', parentIds: [] },
            { id: 'P3', parentIds: [] },
        ];

        it('O is in lane 0', () => {
            expect(lanes(commits)[0]).to.equal(0);
        });

        it('P1 is in lane 0 (first parent)', () => {
            expect(lanes(commits)[1]).to.equal(0);
        });

        it('P2 is in a distinct lane', () => {
            const ls = lanes(commits);
            expect(ls[2]).to.not.equal(0);
        });

        it('P3 is in a distinct lane different from P2', () => {
            const ls = lanes(commits);
            expect(ls[3]).to.not.equal(ls[2]);
        });

        it('O emits 2 branch-out edges (for P2 and P3; P1 same-lane has no edge)', () => {
            const rows = computeGraphRows(commits);
            const oEdges = rows[0].edges.filter(e => e.type === 'branch-out');
            expect(oEdges.length).to.equal(2);
        });

        it('O emits no merge-in edges (no existing lanes converge into O)', () => {
            const rows = computeGraphRows(commits);
            const mergeIn = rows[0].edges.filter(e => e.type === 'merge-in');
            expect(mergeIn.length).to.equal(0);
        });

        it('lane colors are correct modulo 8', () => {
            const rows = computeGraphRows(commits);
            rows.forEach(r => expect(r.color).to.equal(r.lane % 8));
        });
    });

    // -------------------------------------------------------------------------
    // Root commit with no parents
    // -------------------------------------------------------------------------
    describe('single root commit', () => {
        const commits = [{ id: 'R', parentIds: [] }];

        it('is placed in lane 0', () => {
            expect(lanes(commits)).to.deep.equal([0]);
        });

        it('emits no edges', () => {
            const rows = computeGraphRows(commits);
            expect(rows[0].edges).to.be.empty;
        });
    });

    // -------------------------------------------------------------------------
    // Empty input
    // -------------------------------------------------------------------------
    describe('empty input', () => {
        it('returns an empty array', () => {
            expect(computeGraphRows([])).to.deep.equal([]);
        });
    });

    // -------------------------------------------------------------------------
    // hasContinuation and hasTopLine
    // -------------------------------------------------------------------------
    describe('hasContinuation and hasTopLine', () => {

        describe('linear history', () => {
            const commits = [
                { id: 'C', parentIds: ['B'] },
                { id: 'B', parentIds: ['A'] },
                { id: 'A', parentIds: [] },
            ];

            it('first (newest/HEAD) commit has hasContinuation:true, hasTopLine:false', () => {
                const rows = computeGraphRows(commits);
                expect(rows[0].hasContinuation).to.equal(true);
                expect(rows[0].hasTopLine).to.equal(false);
            });

            it('middle commit has hasContinuation:true, hasTopLine:true', () => {
                const rows = computeGraphRows(commits);
                expect(rows[1].hasContinuation).to.equal(true);
                expect(rows[1].hasTopLine).to.equal(true);
            });

            it('root (oldest) commit has hasContinuation:false, hasTopLine:true', () => {
                const rows = computeGraphRows(commits);
                expect(rows[2].hasContinuation).to.equal(false);
                expect(rows[2].hasTopLine).to.equal(true);
            });
        });

        describe('branch-and-merge', () => {
            // Topology: E (lane 1, parent B already in lane 0) — the merge
            // convergence commit whose lane is freed after it is rendered.
            //
            //   M  (lane 0, parents: D, E)
            //   |\
            //   D  E  (D lane 0, E lane 1)
            //   | /
            //   B  (lane 0)
            //   |
            //   A  (lane 0)
            const commits = [
                { id: 'M', parentIds: ['D', 'E'] },
                { id: 'D', parentIds: ['B'] },
                { id: 'E', parentIds: ['B'] },
                { id: 'B', parentIds: ['A'] },
                { id: 'A', parentIds: [] },
            ];

            it('merge commit E (whose parent B is already in lane 0) has hasContinuation:false, hasTopLine:true', () => {
                const rows = computeGraphRows(commits);
                // E is at index 2; its first parent B is already in lane 0,
                // so its own lane is freed — hasContinuation must be false.
                // E was reserved as a parent by M, so hasTopLine must be true.
                expect(rows[2].hasContinuation).to.equal(false);
                expect(rows[2].hasTopLine).to.equal(true);
            });
        });

        describe('single root commit (no parents)', () => {
            it('has hasContinuation:false, hasTopLine:false', () => {
                const rows = computeGraphRows([{ id: 'R', parentIds: [] }]);
                expect(rows[0].hasContinuation).to.equal(false);
                expect(rows[0].hasTopLine).to.equal(false);
            });
        });

    });

    // -------------------------------------------------------------------------
    // Lane freeing on merge convergence
    // -------------------------------------------------------------------------
    describe('lane freeing on merge convergence', () => {
        // Topology: M→D,E → B → A
        //
        //   M  (lane 0, parents: D, E)
        //   |\
        //   D  E  (D in lane 0, E in lane 1)
        //   | /
        //   B  (lane 0 — E's parent B is already tracked in lane 0)
        //   |
        //   A  (lane 0)
        //
        // After rendering E (lane 1, parent B already in lane 0), lane 1 must
        // be freed so that subsequent commits can reuse it.
        const commits = [
            { id: 'M', parentIds: ['D', 'E'] },
            { id: 'D', parentIds: ['B'] },
            { id: 'E', parentIds: ['B'] },
            { id: 'B', parentIds: ['A'] },
            { id: 'A', parentIds: [] },
        ];

        it('E is placed in lane 1', () => {
            const rows = computeGraphRows(commits);
            expect(rows[2].lane).to.equal(1); // E
        });

        it('B is in lane 0 (converges back after E)', () => {
            const rows = computeGraphRows(commits);
            expect(rows[3].lane).to.equal(0); // B
        });

        it('A is in lane 0', () => {
            const rows = computeGraphRows(commits);
            expect(rows[4].lane).to.equal(0); // A
        });

        it('lane 1 is freed after E — B row has no pass-through edge for lane 1', () => {
            const rows = computeGraphRows(commits);
            // Row for B (index 3): there should be no pass-through edge that
            // goes from lane 1 to lane 1, because E has already been rendered
            // and its lane should have been freed.
            const bRow = rows[3];
            const spuriousEdge = bRow.edges.find(
                e => e.fromLane === 1 && e.toLane === 1
            );
            expect(spuriousEdge).to.be.undefined;
        });

        it('lane 1 is reusable after E — new branch between B and A uses lane 1', () => {
            // Insert an independent branch X→Y between B and A so that at the
            // point X is processed, lane 0 is still occupied by 'A' (B's
            // parent).  Lane 1 must have been freed after E, so X should
            // occupy lane 1 rather than opening a new lane 2.
            const commitsWithExtra = [
                { id: 'M', parentIds: ['D', 'E'] },
                { id: 'D', parentIds: ['B'] },
                { id: 'E', parentIds: ['B'] },
                { id: 'B', parentIds: ['A'] },
                // X is an independent commit whose parent Y hasn't appeared
                // yet.  At this point lane 0 holds 'A', lane 1 was freed after
                // E — so X should claim lane 1.
                { id: 'X', parentIds: ['Y'] },
                { id: 'A', parentIds: [] },
                { id: 'Y', parentIds: [] },
            ];
            const rows = computeGraphRows(commitsWithExtra);
            // X (index 4) should reuse the freed lane 1 rather than lane 2.
            expect(rows[4].lane).to.equal(1);
        });

        it('E emits a merge-in edge from lane 0 into E\'s commit lane (B already in lane 0)', () => {
            const rows = computeGraphRows(commits);
            // E is at index 2, in lane 1; B is in lane 0.
            // merge-in edge: fromLane=0 (B's existing lane), toLane=1 (E's commit lane)
            const eRow = rows[2];
            const eEdges = eRow.edges;
            const mergeIn = eEdges.filter(e => e.type === 'merge-in' && e.fromLane === 0 && e.toLane === eRow.lane);
            expect(mergeIn.length).to.equal(1);
        });
    });

    // -------------------------------------------------------------------------
    // Lane color wraps at 8
    // -------------------------------------------------------------------------
    describe('color wrapping', () => {
        it('lane color is always lane % 8', () => {
            // 4 parallel chains so we have lanes 0, 1, 2, 3 occupied at once.
            // Chain structure: X0→X1→X2, Y0→Y1→Y2, etc., interleaved.
            const commits = [
                { id: 'X0', parentIds: ['X1'] },
                { id: 'Y0', parentIds: ['Y1'] },
                { id: 'Z0', parentIds: ['Z1'] },
                { id: 'W0', parentIds: ['W1'] },
                { id: 'X1', parentIds: [] },
                { id: 'Y1', parentIds: [] },
                { id: 'Z1', parentIds: [] },
                { id: 'W1', parentIds: [] },
            ];
            const rows = computeGraphRows(commits);
            // Every row's color must equal lane % 8
            rows.forEach(r => expect(r.color).to.equal(r.lane % 8));
        });

        it('assigns distinct lanes to 8 simultaneous branches', () => {
            // 8 independent commits whose parents haven't been seen yet
            const commits = [
                { id: 'A', parentIds: ['a'] },
                { id: 'B', parentIds: ['b'] },
                { id: 'C', parentIds: ['c'] },
                { id: 'D', parentIds: ['d'] },
                { id: 'E', parentIds: ['e'] },
                { id: 'F', parentIds: ['f'] },
                { id: 'G', parentIds: ['g'] },
                { id: 'H', parentIds: ['h'] },
            ];
            const rows = computeGraphRows(commits);
            const laneSet = new Set(rows.map(r => r.lane));
            expect(laneSet.size).to.equal(8); // all distinct lanes
            // Color of lane 7 is 7, lane 0 is 0
            const lane7 = rows.find(r => r.lane === 7);
            expect(lane7).to.not.be.undefined;
            expect(lane7!.color).to.equal(7);
        });
    });

    // -------------------------------------------------------------------------
    // Edge type correctness
    // -------------------------------------------------------------------------
    describe('edge types', () => {
        it('pass-through edges have fromLane === toLane', () => {
            const commits = [
                { id: 'A', parentIds: ['a'] },
                { id: 'B', parentIds: ['b'] },
                { id: 'C', parentIds: ['c'] },
            ];
            const rows = computeGraphRows(commits);
            // Row for B (index 1): A's lane (0) passes through as pass-through
            const bPassThrough = rows[1].edges.filter(e => e.type === 'pass-through');
            bPassThrough.forEach(e => expect(e.fromLane).to.equal(e.toLane));
        });

        it('branch-out edges have fromLane equal to commit lane', () => {
            const commits = [
                { id: 'M', parentIds: ['D', 'E'] },
                { id: 'D', parentIds: [] },
                { id: 'E', parentIds: [] },
            ];
            const rows = computeGraphRows(commits);
            const mRow = rows[0];
            const branchOut = mRow.edges.filter(e => e.type === 'branch-out');
            branchOut.forEach(e => expect(e.fromLane).to.equal(mRow.lane));
        });

        it('merge-in edges have toLane equal to commit lane', () => {
            // M (lane 0) parents: D (lane 0, new), E (lane 1, new)
            // E (lane 1) parent: B (already in lane 0 from D)
            const commits2 = [
                { id: 'M', parentIds: ['D', 'E'] },
                { id: 'D', parentIds: ['B'] },
                { id: 'E', parentIds: ['B'] },  // B already in lane 0
                { id: 'B', parentIds: [] },
            ];
            const rows = computeGraphRows(commits2);
            const eRow = rows[2]; // E
            const mergeIn = eRow.edges.filter(e => e.type === 'merge-in');
            // toLane of merge-in must equal the commit's own lane
            mergeIn.forEach(e => expect(e.toLane).to.equal(eRow.lane));
        });
    });

    // -------------------------------------------------------------------------
    // Sibling branches (branch tips sharing the same parent)
    // -------------------------------------------------------------------------
    describe('sibling branches sharing the same parent', () => {
        // Two branch tips that were NOT pre-reserved, both pointing at the same
        // parent P.  This mirrors the real-world case where two refs (e.g. HEAD
        // and origin/HEAD) diverge from a common ancestor:
        //
        //   A  (lane 0, parent P)   ← branch tip, not pre-reserved
        //   B  (lane 1, parent P)   ← sibling branch tip, not pre-reserved
        //   P  (lane 0, parent Q)   ← common parent
        //   Q  (lane 0)             ← root
        const commits = [
            { id: 'A', parentIds: ['P'] },
            { id: 'B', parentIds: ['P'] },
            { id: 'P', parentIds: ['Q'] },
            { id: 'Q', parentIds: [] },
        ];

        it('A is placed in lane 0', () => {
            expect(computeGraphRows(commits)[0].lane).to.equal(0);
        });

        it('B is placed in lane 1 (sibling gets new lane)', () => {
            expect(computeGraphRows(commits)[1].lane).to.equal(1);
        });

        it('P converges back to lane 0', () => {
            expect(computeGraphRows(commits)[2].lane).to.equal(0);
        });

        it('A row (row 0) emits NO branch-out edges (siblings are not connected to each other)', () => {
            const rows = computeGraphRows(commits);
            const aEdges = rows[0].edges;
            const branchOut = aEdges.filter(e => e.type === 'branch-out');
            expect(branchOut.length).to.equal(0);
        });

        it('B row (row 1) has hasTopLine:false (lane starts fresh, no connection from above)', () => {
            const rows = computeGraphRows(commits);
            expect(rows[1].hasTopLine).to.equal(false);
        });

        it('B row (row 1) has hasContinuation:true (lane continues as pass-through to parent P at row 2)', () => {
            const rows = computeGraphRows(commits);
            expect(rows[1].hasContinuation).to.equal(true);
        });

        it('B row (row 1) does NOT emit a merge-in edge', () => {
            // A merge-in on B\'s row would mean "a top-of-row line curves into B\'s
            // circle", which is wrong since B was not pre-reserved.
            const rows = computeGraphRows(commits);
            const mergeIn = rows[1].edges.filter(e => e.type === 'merge-in');
            expect(mergeIn.length).to.equal(0);
        });

        it('A row (row 0) has hasTopLine:false (A was not pre-reserved)', () => {
            const rows = computeGraphRows(commits);
            expect(rows[0].hasTopLine).to.equal(false);
        });

        it('P row (row 2) has hasTopLine:true (continuing from A\'s lane)', () => {
            const rows = computeGraphRows(commits);
            expect(rows[2].hasTopLine).to.equal(true);
        });

        it('B row (row 1) has a pass-through edge for lane 0', () => {
            // Lane 0 (pointing at P) continues as a pass-through through B\'s row.
            const rows = computeGraphRows(commits);
            const passThrough = rows[1].edges.find(e => e.type === 'pass-through' && e.fromLane === 0 && e.toLane === 0);
            expect(passThrough).to.not.be.undefined;
        });

        it('P row (row 2) has a merge-in edge from lane 1', () => {
            // Lane 1 (kept alive through B) converges into P\'s lane 0 with a merge-in.
            const rows = computeGraphRows(commits);
            const mergeIn = rows[2].edges.find(e => e.type === 'merge-in' && e.fromLane === 1 && e.toLane === 0);
            expect(mergeIn).to.not.be.undefined;
        });

        it('P row (row 2) has no pass-through for lane 1 (lane 1 is freed at P)', () => {
            const rows = computeGraphRows(commits);
            const spurious = rows[2].edges.find(e => e.fromLane === 1 && e.toLane === 1 && e.type === 'pass-through');
            expect(spurious).to.be.undefined;
        });
    });

    // -------------------------------------------------------------------------
    // Three sibling branches sharing the same parent
    // -------------------------------------------------------------------------
    describe('three sibling branches sharing the same parent', () => {
        // A, B, C all have parent P and none were pre-reserved.
        // Rows: A(lane0), B(lane1), C(lane2), P(lane0), ...
        const commits = [
            { id: 'A', parentIds: ['P'] },
            { id: 'B', parentIds: ['P'] },
            { id: 'C', parentIds: ['P'] },
            { id: 'P', parentIds: [] },
        ];

        it('A is lane 0', () => {
            const rows = computeGraphRows(commits);
            expect(rows[0].lane).to.equal(0);
        });

        it('B is lane 1', () => {
            const rows = computeGraphRows(commits);
            expect(rows[1].lane).to.equal(1);
        });

        it('C is in a lane other than lane 0', () => {
            // C is a sibling tip; its lane is re-assigned from freed lanes
            const rows = computeGraphRows(commits);
            expect(rows[2].lane).to.not.equal(0);
        });

        it('A row emits NO branch-out edges (siblings are not connected to each other)', () => {
            const rows = computeGraphRows(commits);
            const branchOuts = rows[0].edges.filter(e => e.type === 'branch-out');
            expect(branchOuts.length).to.equal(0);
        });

        it('B row emits NO branch-out edges', () => {
            const rows = computeGraphRows(commits);
            const branchOuts = rows[1].edges.filter(e => e.type === 'branch-out');
            expect(branchOuts.length).to.equal(0);
        });

        it('B and C rows both have hasTopLine:false (lanes start fresh, no connection from above)', () => {
            const rows = computeGraphRows(commits);
            expect(rows[1].hasTopLine).to.equal(false);
            expect(rows[2].hasTopLine).to.equal(false);
        });

        it('B and C rows have no merge-in edges', () => {
            const rows = computeGraphRows(commits);
            expect(rows[1].edges.filter(e => e.type === 'merge-in').length).to.equal(0);
            expect(rows[2].edges.filter(e => e.type === 'merge-in').length).to.equal(0);
        });

        it('P row has merge-in edges from both B\'s lane and C\'s lane', () => {
            const rows = computeGraphRows(commits);
            // P is at index 3, in lane 0.  Both lane 1 (B) and lane 2 (C) must
            // converge into P with merge-in edges.
            const pRow = rows[3];
            const mergeInFromLane1 = pRow.edges.find(
                e => e.type === 'merge-in' && e.fromLane === rows[1].lane && e.toLane === pRow.lane
            );
            const mergeInFromLane2 = pRow.edges.find(
                e => e.type === 'merge-in' && e.fromLane === rows[2].lane && e.toLane === pRow.lane
            );
            expect(mergeInFromLane1).to.not.be.undefined;
            expect(mergeInFromLane2).to.not.be.undefined;
        });
    });

});

