/********************************************************************************
 * Copyright (C) 2022 Arm and others.
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
import { Saveable, SaveOptions } from './saveable';
import { Widget } from './widgets';

@injectable()
export class SaveResourceService {

    /**
     * Indicate if the document can be saved ('Save' command should be disable if not).
     */
     canSave(saveable: Saveable): boolean {
        // By default, we never allow a document to be saved if it is untitled.
        return Saveable.isDirty(saveable) && !Saveable.isUntitled(saveable);
    }

    /**
     * Saves the document.
     *
     * This function is called only if `canSave` returns true, which means the document is not untitled
     * and is thus saveable.
     */
    async save(widget: Widget | undefined, options?: SaveOptions): Promise<void> {
        const saveable = Saveable.get(widget);
        if (saveable && this.canSave(saveable)) {
            await saveable.save(options);
        }
    }

}
