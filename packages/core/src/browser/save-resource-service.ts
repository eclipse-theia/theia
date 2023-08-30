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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import { MessageService, UNTITLED_SCHEME } from '../common';
import { Navigatable, NavigatableWidget } from './navigatable-types';
import { Saveable, SaveableSource, SaveOptions } from './saveable';
import { Widget } from './widgets';

@injectable()
export class SaveResourceService {
    @inject(MessageService) protected readonly messageService: MessageService;

    /**
     * Indicate if the document can be saved ('Save' command should be disable if not).
     */
    canSave(widget?: Widget): widget is Widget & (Saveable | SaveableSource) {
        return Saveable.isDirty(widget) && (this.canSaveNotSaveAs(widget) || this.canSaveAs(widget));
    }

    canSaveNotSaveAs(widget?: Widget): widget is Widget & (Saveable | SaveableSource) {
        // By default, we never allow a document to be saved if it is untitled.
        return Boolean(widget && NavigatableWidget.getUri(widget)?.scheme !== UNTITLED_SCHEME);
    }

    /**
     * Saves the document
     *
     * No op if the widget is not saveable.
     */
    async save(widget: Widget | undefined, options?: SaveOptions): Promise<void> {
        if (this.canSaveNotSaveAs(widget)) {
            await Saveable.save(widget, options);
        } else if (this.canSaveAs(widget)) {
            await this.saveAs(widget, options);
        }
    }

    canSaveAs(saveable?: Widget): saveable is Widget & SaveableSource & Navigatable {
        return false;
    }

    saveAs(sourceWidget: Widget & SaveableSource & Navigatable, options?: SaveOptions): Promise<void> {
        return Promise.reject('Unsupported: The base SaveResourceService does not support saveAs action.');
    }
}
