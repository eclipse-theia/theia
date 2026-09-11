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

/**
 * Computes how far a scroll container must scroll so that the vertical range `[rowTop, rowBottom]`,
 * given in pixels relative to the top edge of the container's visible area, becomes fully visible.
 * Negative values scroll up, positive values scroll down, `0` means the range is already visible.
 */
export function computeRevealScrollDelta(rowTop: number, rowBottom: number, viewportHeight: number): number {
    if (rowTop < 0) {
        return rowTop;
    }
    if (rowBottom > viewportHeight) {
        return rowBottom - viewportHeight;
    }
    return 0;
}
