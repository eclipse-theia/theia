/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
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
