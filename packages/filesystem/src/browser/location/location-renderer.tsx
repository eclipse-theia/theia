/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import URI from '@theia/core/lib/common/uri';
import { LocationService } from './location-service';
import { ReactRenderer } from '@theia/core/lib/browser/widgets/react-renderer';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { FileService } from '../file-service';
import { DisposableCollection, Emitter } from '@theia/core/lib/common';

interface AutoSuggestDataEvent {
    parent: string;
    children: string[];
}

class ResolvedDirectoryCache {
    protected pendingResolvedDirectories = new Map<string, Promise<void>>();
    protected cachedDirectories = new Map<string, string[]>();

    protected directoryResolvedEmitter = new Emitter<AutoSuggestDataEvent>();
    readonly onDirectoryDidResolve = this.directoryResolvedEmitter.event;

    constructor(protected readonly fileService: FileService) { }

    tryResolveChildDirectories(inputAsURI: URI): string[] | undefined {
        const parentDirectory = inputAsURI.path.dir.toString();
        const cachedDirectories = this.cachedDirectories.get(parentDirectory);
        const pendingDirectories = this.pendingResolvedDirectories.get(parentDirectory);
        if (cachedDirectories) {
            return cachedDirectories;
        } else if (!pendingDirectories) {
            this.pendingResolvedDirectories.set(parentDirectory, this.createResolutionPromise(parentDirectory));
        }
        return undefined;
    }

    protected async createResolutionPromise(directoryToResolve: string): Promise<void> {
        return this.fileService.resolve(new URI(directoryToResolve)).then(({ children }) => {
            if (children) {
                const childDirectories = children.filter(child => child.isDirectory)
                    .map(directory => `${directory.resource.path}/`);
                this.cachedDirectories.set(directoryToResolve, childDirectories);
                this.directoryResolvedEmitter.fire({ parent: directoryToResolve, children: childDirectories });
            }
        }).catch(e => {
            // no-op
        });
    }
}
export class LocationListRenderer extends ReactRenderer {

    protected directoryCache: ResolvedDirectoryCache;
    protected toDisposeOnNewCache = new DisposableCollection();
    protected _drives: URI[] | undefined;
    protected _doShowTextInput = false;
    get doShowTextInput(): boolean {
        return this._doShowTextInput;
    }
    set doShowTextInput(doShow: boolean) {
        this._doShowTextInput = doShow;
        if (doShow) {
            this.initResolveDirectoryCache();
        }
    }
    protected lastUniqueTextInputLocation: URI | undefined;
    protected previousAutocompleteMatch: string;
    protected doAttemptAutocomplete = true;

    constructor(
        protected readonly service: LocationService,
        protected readonly fileService: FileService,
        host?: HTMLElement
    ) {
        super(host);
        this.doLoadDrives();
    }

    render(): void {
        ReactDOM.render(this.doRender(), this.host, this.doAfterRender);
    }

    protected initResolveDirectoryCache(): void {
        this.toDisposeOnNewCache.dispose();
        this.directoryCache = new ResolvedDirectoryCache(this.fileService);
        this.toDisposeOnNewCache.push(this.directoryCache.onDirectoryDidResolve(({ parent, children }) => {
            if (this.locationTextInput) {
                const inputParent = (new URI(this.locationTextInput.value)).path.dir.toString();
                if (inputParent === parent) {
                    this.tryRenderFirstMatch(this.locationTextInput, children);
                }
            }
        }));
    }

    protected doAfterRender = (): void => {
        const locationList = this.locationList;
        const locationListTextInput = this.locationTextInput;
        if (locationList) {
            const currentLocation = this.service.location;
            locationList.value = currentLocation ? currentLocation.toString() : '';
        } else if (locationListTextInput) {
            locationListTextInput.focus();
        }
    };

    protected readonly handleLocationChanged = (e: React.ChangeEvent<HTMLSelectElement>) => this.onLocationChanged(e);
    protected readonly handleTextInputOnChange = (e: React.ChangeEvent<HTMLInputElement>) => this.trySuggestDirectory(e);
    protected readonly handleTextInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => this.handleControlKeys(e);
    protected readonly handleIconKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => this.toggleInputOnKeyDown(e);
    protected readonly handleTextInputOnBlur = () => this.toggleToSelectInput();
    protected readonly handleTextInputMouseDown = (e: React.MouseEvent<HTMLSpanElement>) => this.toggleToTextInputOnMouseDown(e);

    protected doRender(): React.ReactElement {
        return (
            <>
                {this.renderInputIcon()}
                {this.doShowTextInput
                    ? this.renderTextInput()
                    : this.renderSelectInput()
                }
            </>
        );
    }

    protected renderInputIcon(): React.ReactNode {
        return (
            <span
                // onMouseDown is used since it will fire before 'onBlur'. This prevents
                // a re-render when textinput is in focus and user clicks toggle icon
                onMouseDown={this.handleTextInputMouseDown}
                onKeyDown={this.handleIconKeyDown}
                className={LocationListRenderer.Styles.LOCATION_INPUT_TOGGLE_CLASS}
                tabIndex={0}
                id={`${this.doShowTextInput ? 'text-input' : 'select-input'}`}
                title={this.doShowTextInput
                    ? LocationListRenderer.Tooltips.TOGGLE_SELECT_INPUT
                    : LocationListRenderer.Tooltips.TOGGLE_TEXT_INPUT}
            >
                <i className={this.doShowTextInput ? 'fa fa-folder-open' : 'fa fa-edit'} />
            </span>
        );
    }

    protected renderTextInput(): React.ReactNode {
        return (
            <input className={'theia-select ' + LocationListRenderer.Styles.LOCATION_TEXT_INPUT_CLASS}
                defaultValue={this.service.location?.path.toString()}
                onBlur={this.handleTextInputOnBlur}
                onChange={this.handleTextInputOnChange}
                onKeyDown={this.handleTextInputKeyDown}
                spellCheck={false}
            />
        );
    }

    protected renderSelectInput(): React.ReactNode {
        const options = this.collectLocations().map(value => this.renderLocation(value));
        return (
            <select className={`theia-select ${LocationListRenderer.Styles.LOCATION_LIST_CLASS}`}
                onChange={this.handleLocationChanged}>
                {...options}
            </select>
        );
    }

    protected toggleInputOnKeyDown(e: React.KeyboardEvent<HTMLSpanElement>): void {
        if (e.key === 'Enter') {
            this.doShowTextInput = true;
            this.render();
        }
    }

    protected toggleToTextInputOnMouseDown(e: React.MouseEvent<HTMLSpanElement>): void {
        if (e.currentTarget.id === 'select-input') {
            e.preventDefault();
            this.doShowTextInput = true;
            this.render();
        }
    }

    protected toggleToSelectInput(): void {
        if (this.doShowTextInput) {
            this.doShowTextInput = false;
            this.render();
        }
    }

    /**
     * Collects the available locations based on the currently selected, and appends the available drives to it.
     */
    protected collectLocations(): LocationListRenderer.Location[] {
        const location = this.service.location;
        const locations: LocationListRenderer.Location[] = (!!location ? location.allLocations : []).map(uri => ({ uri }));
        if (this._drives) {
            const drives = this._drives.map(uri => ({ uri, isDrive: true }));
            // `URI.allLocations` returns with the URI without the trailing slash unlike `FileUri.create(fsPath)`.
            // to be able to compare file:///path/to/resource with file:///path/to/resource/.
            const toUriString = (uri: URI) => {
                const toString = uri.toString();
                return toString.endsWith('/') ? toString.slice(0, -1) : toString;
            };
            drives.forEach(drive => {
                const index = locations.findIndex(loc => toUriString(loc.uri) === toUriString(drive.uri));
                // Ignore drives which are already discovered as a location based on the current model root URI.
                if (index === -1) {
                    // Make sure, it does not have the trailing slash.
                    locations.push({ uri: new URI(toUriString(drive.uri)), isDrive: true });
                } else {
                    // This is necessary for Windows to be able to show `/e:/` as a drive and `c:` as "non-drive" in the same way.
                    // `URI.path.toString()` Vs. `URI.displayName` behaves a bit differently on Windows.
                    // https://github.com/eclipse-theia/theia/pull/3038#issuecomment-425944189
                    locations[index].isDrive = true;
                }
            });
        }
        this.doLoadDrives();
        return locations;
    }

    /**
     * Asynchronously loads the drives (if not yet available) and triggers a UI update on success with the new values.
     */
    protected doLoadDrives(): void {
        if (!this._drives) {
            this.service.drives().then(drives => {
                // If the `drives` are empty, something already went wrong.
                if (drives.length > 0) {
                    this._drives = drives;
                    this.render();
                }
            });
        }
    }

    protected renderLocation(location: LocationListRenderer.Location): React.ReactNode {
        const { uri, isDrive } = location;
        const value = uri.toString();
        return <option value={value} key={uri.toString()}>{isDrive ? uri.path.toString() : uri.displayName}</option>;
    }

    protected onLocationChanged(e: React.ChangeEvent<HTMLSelectElement>): void {
        const locationList = this.locationList;
        if (locationList) {
            const value = locationList.value;
            const uri = new URI(value);
            this.trySetNewLocation(uri);
            e.preventDefault();
            e.stopPropagation();
        }
    }

    protected trySetNewLocation(newLocation: URI): void {
        if (this.lastUniqueTextInputLocation === undefined) {
            this.lastUniqueTextInputLocation = this.service.location;
        }
        // prevent consecutive repeated locations from being added to location history
        if (this.lastUniqueTextInputLocation?.path.toString() !== newLocation.path.toString()) {
            this.lastUniqueTextInputLocation = newLocation;
            this.service.location = newLocation;
        }
    }

    protected trySuggestDirectory(e: React.ChangeEvent<HTMLInputElement>): void {
        if (this.doAttemptAutocomplete) {
            const inputElement = e.currentTarget;
            const { value } = inputElement;
            if (value.slice(-1) !== '/') {
                const valueAsURI = new URI(value);
                const autocompleteDirectories = this.directoryCache.tryResolveChildDirectories(valueAsURI);
                if (autocompleteDirectories) {
                    this.tryRenderFirstMatch(inputElement, autocompleteDirectories);
                }
            }
        }
    }

    protected tryRenderFirstMatch(inputElement: HTMLInputElement, children: string[]): void {
        const { value, selectionStart } = inputElement;
        if (this.locationTextInput) {
            const firstMatch = children?.find(child => child.includes(value));
            if (firstMatch) {
                this.locationTextInput.value = firstMatch;
                this.locationTextInput.selectionStart = selectionStart;
                this.locationTextInput.selectionEnd = firstMatch.length;
            }
        }
    }

    protected handleControlKeys(e: React.KeyboardEvent<HTMLInputElement>): void {
        this.doAttemptAutocomplete = e.key !== 'Backspace';
        if (e.key === 'Enter') {
            const locationTextInput = this.locationTextInput;
            if (locationTextInput) {
                // remove extra whitespace and any trailing slashes or periods.
                const sanitizedInput = locationTextInput.value.trim().replace(/[\/\\.]*$/, '');
                const uri = new URI(sanitizedInput);
                this.trySetNewLocation(uri);
                this.toggleToSelectInput();
            }
        } else if (e.key === 'Escape') {
            this.toggleToSelectInput();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const textInput = this.locationTextInput;
            if (textInput) {
                textInput.selectionStart = textInput.value.length;
            }
        }
        e.stopPropagation();
    }

    get locationList(): HTMLSelectElement | undefined {
        const locationList = this.host.getElementsByClassName(LocationListRenderer.Styles.LOCATION_LIST_CLASS)[0];
        if (locationList instanceof HTMLSelectElement) {
            return locationList;
        }
        return undefined;
    }

    get locationTextInput(): HTMLInputElement | undefined {
        const locationTextInput = this.host.getElementsByClassName(LocationListRenderer.Styles.LOCATION_TEXT_INPUT_CLASS)[0];
        if (locationTextInput instanceof HTMLInputElement) {
            return locationTextInput;
        }
        return undefined;
    }

    dispose(): void {
        super.dispose();
        this.toDisposeOnNewCache.dispose();
    }
}

export namespace LocationListRenderer {

    export namespace Styles {
        export const LOCATION_LIST_CLASS = 'theia-LocationList';
        export const LOCATION_INPUT_TOGGLE_CLASS = 'theia-LocationInputToggle';
        export const LOCATION_TEXT_INPUT_CLASS = 'theia-LocationTextInput';
    }

    export namespace Tooltips {
        export const TOGGLE_TEXT_INPUT = 'Switch to text-based input';
        export const TOGGLE_SELECT_INPUT = 'Switch to location list';
    }

    export interface Location {
        uri: URI;
        isDrive?: boolean;
    }

}
