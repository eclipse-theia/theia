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

import { inject, injectable } from 'inversify';
import { MaybePromise } from '../../common/types';
import { Widget } from '../widgets';
import { SaveableService } from '../saveable-service';

export const SecondaryWindowCloseContribution = Symbol('SecondaryWindowCloseContribution');
/**
 * Decides which widgets are moved back to the main window when their secondary window is closed,
 * if the `window.secondaryWindowCloseBehavior` preference is `close`. All other widgets are closed.
 */
export interface SecondaryWindowCloseContribution {
    /**
     * @returns `true` if the widget would lose state if it was closed, so that it is moved back to the main window instead,
     * `false` or `undefined` if it may be closed as far as this contribution is concerned
     */
    shouldRestoreOnClose(widget: Widget): MaybePromise<boolean | undefined>;
}

/**
 * Moves widgets with unsaved changes back to the main window, unless they are saved automatically.
 */
@injectable()
export class SaveableSecondaryWindowCloseContribution implements SecondaryWindowCloseContribution {

    @inject(SaveableService)
    protected readonly saveableService: SaveableService;

    shouldRestoreOnClose(widget: Widget): boolean {
        return this.saveableService.wouldLoseChangesOnClose(widget);
    }
}
