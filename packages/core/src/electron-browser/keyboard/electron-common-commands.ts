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

import { remote } from 'electron';
import { injectable } from 'inversify';
import { UndoHandler, RedoHandler, SelectAllHandler } from '../../browser/common-frontend-contribution';

@injectable()
export class ElectronUndoHandler extends UndoHandler {

    execute(): void {
        remote.getCurrentWebContents().undo();
    }

}

@injectable()
export class ElectronRedoHandler extends RedoHandler {

    execute(): void {
        remote.getCurrentWebContents().redo();
    }

}

@injectable()
export class ElectronSelectAllHandler extends SelectAllHandler {

    execute(): void {
        remote.getCurrentWebContents().selectAll();
    }

}
