/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { Range } from '../navigation-location';
import { NavigationLocationUpdater } from '../navigation-location-updater';

/**
 * Navigation location updater with increased method visibility for testing.
 */
export class MockNavigationLocationUpdater extends NavigationLocationUpdater {

    contained(subRange: Range, range: Range): boolean {
        return super.contained(subRange, range);
    }

}

/**
 * NOOP navigation location updater for testing. Use this, if you want to avoid any
 * location updates during the tests.
 */
export class NoopNavigationLocationUpdater extends NavigationLocationUpdater {

    affects(): false {
        return false;
    }

}
