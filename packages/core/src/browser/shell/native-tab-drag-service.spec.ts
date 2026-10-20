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

import { enableJSDOM } from '../test/jsdom';
let disableJSDOM = enableJSDOM();
import { expect } from 'chai';

import { NativeTabDragService } from './native-tab-drag-service';

disableJSDOM();

class TestableNativeTabDragService extends NativeTabDragService {

    /** Sets the state of the main window as if the pointer had been over it, and had left it just now if `leaving` */
    setPointerState(leaving: boolean): void {
        const state = this.windows.get(window)!;
        state.inside = true;
        if (leaving) {
            this.scheduleLeave(state);
        }
    }

    callIsInsideWindows(event: DragEvent): boolean {
        return this.isInsideWindows(event);
    }

    dispose(): void {
        this.windows.forEach(state => this.cancelLeave(state));
    }
}

describe('NativeTabDragService', () => {

    let service: TestableNativeTabDragService;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        service = new TestableNativeTabDragService();
        service['init']();
        Object.assign(window, { screenX: 100, screenY: 100, outerWidth: 800, outerHeight: 600 });
    });

    afterEach(() => {
        service.dispose();
    });

    function dragEnd(screenX: number, screenY: number): DragEvent {
        return { screenX, screenY } as DragEvent;
    }

    it('should consider the pointer inside a window that it has not left', () => {
        service.setPointerState(false);
        expect(service.callIsInsideWindows(dragEnd(0, 0))).to.be.true;
    });

    it('should consider the pointer outside a window that it has just left if released outside of it', () => {
        service.setPointerState(true);
        expect(service.callIsInsideWindows(dragEnd(950, 300))).to.be.false;
    });

    it('should consider the pointer inside a window that it has just left if released within its bounds', () => {
        service.setPointerState(true);
        expect(service.callIsInsideWindows(dragEnd(500, 300))).to.be.true;
    });

});
