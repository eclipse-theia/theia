// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { SplitLayout, SplitPanel } from '@lumino/widgets';

export class TheiaSplitPanel extends SplitPanel {
    constructor(options?: SplitPanel.IOptions) {
        super(options);

        let oldCursor: string | undefined;
        let pointerId: number | undefined;

        this['_evtPointerDown'] = (event: PointerEvent) => {
            super['_evtPointerDown'](event);
            if (this['_pressData']) { // indicating that the drag has started
                this.node.setPointerCapture(event.pointerId);
                pointerId = event.pointerId;
                const layout = this.layout as SplitLayout;
                const handle = layout.handles.find(h => h.contains(event.target as HTMLElement));
                if (handle) {
                    const style = window.getComputedStyle(handle);
                    oldCursor = this.node.style.cursor;
                    this.node.style.cursor = style.cursor;
                }
            }
        };
        this['_releaseMouse'] = () => {
            super['_releaseMouse']();
            if (oldCursor !== undefined) {
                this.node.style.cursor = oldCursor;
                oldCursor = undefined;
            }
            if (pointerId) {
                this.node.releasePointerCapture(pointerId);
                pointerId = undefined;
            }
        };
    }

    override handleEvent(event: Event): void {
        const pressed = !!this['_pressData'];
        if (pressed && event.type === 'pointerleave') {
            // Lumino removes the highlight of crossing handles on `pointerleave`, which fires during a handle drag
            // as soon as `@lumino/dragdrop` captures the pointer for its cursor backdrop.
            return;
        }
        super.handleEvent(event);
        if (pressed && !this['_pressData'] && event.type === 'pointerup') {
            // Lumino does not update the highlight of crossing handles after a drag.
            const { clientX, clientY } = event as PointerEvent;
            this['_updateIntersectionHover'](this.node.ownerDocument.elementFromPoint(clientX, clientY), clientX, clientY);
        }
    }
}
