// *****************************************************************************
// Copyright (C) 2025 and others.
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

import { IPosition } from '@theia/monaco-editor-core/esm/vs/editor/common/core/position';
import { ContentHoverWidget } from '@theia/monaco-editor-core/esm/vs/editor/contrib/hover/browser/contentHoverWidget';

// https://github.com/microsoft/vscode/blob/1430e1845cbf5ec29a2fc265f12c7fb5c3d685c3/src/vs/editor/contrib/hover/browser/resizableContentWidget.ts#L13-L14
const VSCODE_TOP_HEIGHT = 30;
const VSCODE_BOTTOM_HEIGHT = 24;

export interface SetActualHeightForContentHoverWidgetParams {
    topHeight?: number;
    bottomHeight?: number;
}

export interface ContentHoverWidgetPatcher {
    setActualHeightForContentHoverWidget(params: SetActualHeightForContentHoverWidgetParams): void;
}

export function createContentHoverWidgetPatcher(): ContentHoverWidgetPatcher {
    let actualTopDiff: number | undefined;
    let actualBottomDiff: number | undefined;

    const originalAvailableVerticalSpaceAbove = ContentHoverWidget.prototype['_availableVerticalSpaceAbove'];
    ContentHoverWidget.prototype['_availableVerticalSpaceAbove'] = function (position: IPosition): number | undefined {
        const originalValue = originalAvailableVerticalSpaceAbove.call(this, position);
        if (typeof originalValue !== 'number' || !actualTopDiff) {
            return originalValue;
        }
        // The original implementation deducts the height of the top panel from the total available space.
        // https://github.com/microsoft/vscode/blob/1430e1845cbf5ec29a2fc265f12c7fb5c3d685c3/src/vs/editor/contrib/hover/browser/resizableContentWidget.ts#L71
        // However, in Theia, the top panel has generally different size (especially when the toolbar is visible).
        // This additional height must be further subtracted from the computed height for accurate positioning.
        return originalValue - actualTopDiff;
    };

    const originalAvailableVerticalSpaceBelow = ContentHoverWidget.prototype['_availableVerticalSpaceBelow'];
    ContentHoverWidget.prototype['_availableVerticalSpaceBelow'] = function (position: IPosition): number | undefined {
        const originalValue = originalAvailableVerticalSpaceBelow.call(this, position);
        if (typeof originalValue !== 'number' || !actualBottomDiff) {
            return originalValue;
        }
        // The original method subtracts the height of the bottom panel from the overall available height.
        // https://github.com/microsoft/vscode/blob/1430e1845cbf5ec29a2fc265f12c7fb5c3d685c3/src/vs/editor/contrib/hover/browser/resizableContentWidget.ts#L83
        // In Theia, the status bar has different height than in VS Code, which means this difference
        // should be also removed to ensure the calculated available space is accurate.
        // Note that removing negative value will increase the available space.
        return originalValue - actualBottomDiff;
    };

    return {
        setActualHeightForContentHoverWidget(params): void {
            if (typeof params.topHeight === 'number') {
                actualTopDiff = params.topHeight - VSCODE_TOP_HEIGHT;
            }
            if (typeof params.bottomHeight === 'number') {
                actualBottomDiff = params.bottomHeight - VSCODE_BOTTOM_HEIGHT;
            }
        },
    };
}
