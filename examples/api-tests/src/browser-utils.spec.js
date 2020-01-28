/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

// @ts-check
describe('animationFrame', function () {
    const { assert } = chai;
    const { animationFrame } = require('@theia/core/lib/browser/browser');

    class FrameCounter {
        constructor() {
            this.count = 0;
            this.stop = false;
            this.run();
        }
        run() {
            requestAnimationFrame(this.nextFrame.bind(this));
        }
        nextFrame() {
            this.count++;
            if (!this.stop) {
                this.run();
            }
        }
    }

    it('should resolve after one frame', async () => {
        const counter = new FrameCounter();
        await animationFrame();
        counter.stop = true;
        assert.equal(counter.count, 1);
    });

    it('should resolve after the given number of frames', async () => {
        const counter = new FrameCounter();
        await animationFrame(10);
        counter.stop = true;
        assert.equal(counter.count, 10);
    });

});
