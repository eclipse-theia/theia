/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "../../../application/common/uri";

export interface LocationModel {
    currentLocation: URI | undefined;
}

export class LocationService {

    constructor(
        readonly model: LocationModel
    ) { }

    /**
     * Return all locations from the current to the top most.
     * If the current location is undefined then return an empty list.
     */
    get allLocations(): URI[] {
        return this.getAllLocations();
    }

    protected getAllLocations(): URI[] {
        const current = this.model.currentLocation;
        if (!current) {
            return [];
        }
        const locations = [];
        let location = current;
        while (!location.path.root) {
            locations.push(location);
            location = location.parent;
        }
        locations.push(location);
        return locations;
    }

}

