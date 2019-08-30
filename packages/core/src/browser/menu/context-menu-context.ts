/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { OS } from '../../common/os';

@injectable()
export class ContextMenuContext {

    protected _altPressed = false;
    get altPressed(): boolean {
        return this._altPressed;
    }

    protected setAltPressed(altPressed: boolean): void {
        this._altPressed = altPressed;
    }

    resetAltPressed(): void {
        this.setAltPressed(false);
    }

    constructor() {
        document.addEventListener('keydown', e => this.setAltPressed(e.altKey || (OS.type() !== OS.Type.OSX && e.shiftKey)), true);
        document.addEventListener('keyup', () => this.resetAltPressed(), true);
    }

}
