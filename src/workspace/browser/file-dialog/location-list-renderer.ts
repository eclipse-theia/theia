/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { h } from '@phosphor/virtualdom';
import { VirtualRenderer } from "../../../application/browser";
import { FileDialogModel } from './file-dialog-model';
import URI from "../../../application/common/uri";
export const LOCATION_LIST_CLASS = 'theia-LocationList';

export class LocationListRenderer extends VirtualRenderer {

    constructor(
        readonly model: FileDialogModel,
        host?: HTMLElement
    ) {
        super(host);
    }

    protected onRender(): void {
        const locationList = this.locationList;
        if (locationList) {
            const currentLocation = this.model.currentLocation;
            locationList.value = currentLocation ? currentLocation.toString() : '';
        }
    }

    protected doRender(): h.Child {
        const locations = this.model.allLocations.reverse();
        const options = locations.map(value => this.renderLocation(value));
        return h.select({
            className: LOCATION_LIST_CLASS,
            onchange: e => this.onLocationChanged(e)
        }, ...options);
    }

    protected renderLocation(uri: URI): h.Child {
        const value = uri.toString();
        return h.option({
            value
        }, uri.lastSegment);
    }

    protected onLocationChanged(e: Event): void {
        const locationList = this.locationList;
        if (locationList) {
            const value = locationList.value;
            const uri = new URI(value);
            this.model.currentLocation = uri;
        }
        e.preventDefault();
        e.stopPropagation();
    }

    protected get locationList(): HTMLSelectElement | undefined {
        const locationList = this.host.getElementsByClassName(LOCATION_LIST_CLASS)[0];
        if (locationList instanceof HTMLSelectElement) {
            return locationList;
        }
        return undefined;
    }

}