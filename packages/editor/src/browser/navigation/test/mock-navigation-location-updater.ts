/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
