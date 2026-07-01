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

export type EditorGroupNavigationDirection = 'left' | 'right' | 'up' | 'down';

export interface EditorGroupNavigationRect {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
}

type EditorGroupNavigationScore = [
    orthogonalRank: number,
    orthogonalGap: number,
    primaryDistance: number,
    orthogonalCenterDistance: number,
    orthogonalStart: number
];

export function findClosestEditorGroup(source: EditorGroupNavigationRect, candidates: ReadonlyArray<EditorGroupNavigationRect>, direction: EditorGroupNavigationDirection): number {
    let bestIndex = -1;
    let bestScore: EditorGroupNavigationScore | undefined;
    for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (!isInDirection(source, candidate, direction)) {
            continue;
        }
        const candidateScore = score(source, candidate, direction);
        if (!bestScore || compareScore(candidateScore, bestScore) < 0) {
            bestIndex = index;
            bestScore = candidateScore;
        }
    }
    return bestIndex;
}

function isInDirection(source: EditorGroupNavigationRect, candidate: EditorGroupNavigationRect, direction: EditorGroupNavigationDirection): boolean {
    const sourceCenter = rectCenter(source);
    const candidateCenter = rectCenter(candidate);
    switch (direction) {
        case 'left':
            return candidateCenter.x < sourceCenter.x;
        case 'right':
            return candidateCenter.x > sourceCenter.x;
        case 'up':
            return candidateCenter.y < sourceCenter.y;
        case 'down':
            return candidateCenter.y > sourceCenter.y;
    }
}

function score(source: EditorGroupNavigationRect, candidate: EditorGroupNavigationRect, direction: EditorGroupNavigationDirection): EditorGroupNavigationScore {
    const horizontal = direction === 'left' || direction === 'right';
    const sourceCenter = rectCenter(source);
    const candidateCenter = rectCenter(candidate);
    const orthogonalOverlap = horizontal
        ? intervalOverlap(source.top, source.bottom, candidate.top, candidate.bottom)
        : intervalOverlap(source.left, source.right, candidate.left, candidate.right);
    return [
        orthogonalOverlap > 0 ? 0 : 1,
        Math.max(0, -orthogonalOverlap),
        directionalDistance(source, candidate, direction),
        horizontal ? Math.abs(sourceCenter.y - candidateCenter.y) : Math.abs(sourceCenter.x - candidateCenter.x),
        horizontal ? candidate.top : candidate.left
    ];
}

function compareScore(left: EditorGroupNavigationScore, right: EditorGroupNavigationScore): number {
    return left[0] - right[0]
        || left[1] - right[1]
        || left[2] - right[2]
        || left[3] - right[3]
        || left[4] - right[4];
}

function directionalDistance(source: EditorGroupNavigationRect, candidate: EditorGroupNavigationRect, direction: EditorGroupNavigationDirection): number {
    switch (direction) {
        case 'left':
            return Math.max(0, source.left - candidate.right);
        case 'right':
            return Math.max(0, candidate.left - source.right);
        case 'up':
            return Math.max(0, source.top - candidate.bottom);
        case 'down':
            return Math.max(0, candidate.top - source.bottom);
    }
}

function rectCenter(rect: EditorGroupNavigationRect): { x: number, y: number } {
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function intervalOverlap(start: number, end: number, candidateStart: number, candidateEnd: number): number {
    return Math.min(end, candidateEnd) - Math.max(start, candidateStart);
}
