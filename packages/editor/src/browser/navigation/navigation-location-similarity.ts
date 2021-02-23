/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { NavigationLocation } from './navigation-location';

/**
 * Service for checking whether two navigation locations are similar or not.
 */
@injectable()
export class NavigationLocationSimilarity {

    /**
     * The number of lines to move in the editor to justify for new state.
     */
    private static EDITOR_SELECTION_THRESHOLD = 10;

    /**
     * `true` if the `left` and `right` locations are withing +- 10 lines in the same editor. Otherwise, `false`.
     */
    similar(left: NavigationLocation | undefined, right: NavigationLocation | undefined): boolean {
        if (left === undefined || right === undefined) {
            return left === right;
        }

        if (left.uri.toString() !== right.uri.toString()) {
            return false;
        }

        const leftRange = NavigationLocation.range(left);
        const rightRange = NavigationLocation.range(right);
        if (leftRange === undefined || rightRange === undefined) {
            return leftRange === rightRange;
        }

        const leftLineNumber = Math.min(leftRange.start.line, leftRange.end.line);
        const rightLineNumber = Math.min(rightRange.start.line, rightRange.end.line);
        return Math.abs(leftLineNumber - rightLineNumber) < this.getThreshold();
    }

    protected getThreshold(): number {
        return NavigationLocationSimilarity.EDITOR_SELECTION_THRESHOLD;
    }

}
