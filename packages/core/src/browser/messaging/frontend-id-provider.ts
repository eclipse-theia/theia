// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { injectable } from 'inversify';
import { generateUuid } from '../../common/uuid';

export const FrontendIdProvider = Symbol('FrontendIdProvider');

/**
 * A FrontendIdProvider computes an id for an instance of the front end that may be reconnected to a back end
 * connection context.
 */
export interface FrontendIdProvider {
    getId(): string;
}

@injectable()
export class BrowserFrontendIdProvider implements FrontendIdProvider {
    protected readonly id = generateUuid(); // generate a new id each time we load the application

    getId(): string {
        return this.id;
    }
}
