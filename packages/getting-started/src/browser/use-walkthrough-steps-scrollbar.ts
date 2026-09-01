// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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

import * as React from '@theia/core/shared/react';
import PerfectScrollbarConstructor from 'perfect-scrollbar';

// The browser bundle provides the esm default; Mocha loads the package's cjs export.
const PerfectScrollbar = PerfectScrollbarConstructor ?? require('perfect-scrollbar') as typeof PerfectScrollbarConstructor;

export function useWalkthroughStepsScrollbar(ref: React.RefObject<HTMLDivElement>): () => void {
    const updateTopShadow = React.useCallback(() => {
        const element = ref.current;
        element?.classList.toggle('gs-walkthrough-steps-scrolled', element.scrollTop > 0);
    }, [ref]);
    React.useEffect(() => {
        const element = ref.current;
        if (!element) {
            return undefined;
        }
        const scrollbar = new PerfectScrollbar(element, {
            suppressScrollX: true,
            useBothWheelAxes: true,
            wheelPropagation: false
        });
        updateTopShadow();
        element.addEventListener('scroll', updateTopShadow);
        const update = (): void => {
            scrollbar.update();
            updateTopShadow();
        };
        const contentObserver = new MutationObserver(update);
        contentObserver.observe(element, { childList: true, subtree: true });
        const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
        resizeObserver?.observe(element);
        return () => {
            element.removeEventListener('scroll', updateTopShadow);
            resizeObserver?.disconnect();
            contentObserver.disconnect();
            scrollbar.destroy();
        };
    }, [ref, updateTopShadow]);
    return updateTopShadow;
}
