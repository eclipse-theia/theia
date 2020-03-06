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

import { inject, injectable, named } from 'inversify';
import * as fileIcons from 'file-icons-js';
import URI from '../common/uri';
import { ContributionProvider } from '../common/contribution-provider';
import { Prioritizeable } from '../common/types';
import { Event, Emitter } from '../common';
import { FrontendApplicationContribution } from './frontend-application';

/**
 * @internal don't export it, use `LabelProvider.folderIcon` instead.
 */
const DEFAULT_FOLDER_ICON = 'fa fa-folder';
/**
 * @internal don't export it, use `LabelProvider.fileIcon` instead.
 */
const DEFAULT_FILE_ICON = 'fa fa-file';

/**
 * Internal folder icon class for the default (File Icons) theme.
 *
 * @deprecated Use `LabelProvider.folderIcon` to get a folder icon class for the current icon theme.
 */
export const FOLDER_ICON = DEFAULT_FOLDER_ICON;
/**
 * Internal file icon class for the default (File Icons) theme.
 *
 * @deprecated Use `LabelProvider.fileIcon` to get a file icon class for the current icon theme.
 */
export const FILE_ICON = DEFAULT_FILE_ICON;

export const LabelProviderContribution = Symbol('LabelProviderContribution');
export interface LabelProviderContribution {

    /**
     * whether this contribution can handle the given element and with what priority.
     * All contributions are ordered by the returned number if greater than zero. The highest number wins.
     * If two or more contributions return the same positive number one of those will be used. It is undefined which one.
     */
    canHandle(element: object): number;

    /**
     * returns an icon class for the given element.
     */
    getIcon?(element: object): string | undefined;

    /**
     * returns a short name for the given element.
     */
    getName?(element: object): string | undefined;

    /**
     * returns a long name for the given element.
     */
    getLongName?(element: object): string | undefined;

    /**
     * Emit when something has changed that may result in this label provider returning a different
     * value for one or more properties (name, icon etc).
     */
    readonly onDidChange?: Event<DidChangeLabelEvent>;

    /**
     * Check whether the given element is affected by the given change event.
     * Contributions delegating to the label provider can use this hook
     * to perform a recursive check.
     */
    affects?(element: object, event: DidChangeLabelEvent): boolean;

}

export interface DidChangeLabelEvent {
    affects(element: object): boolean;
}

export interface URIIconReference {
    kind: 'uriIconReference';
    id: 'file' | 'folder';
    uri?: URI
}
export namespace URIIconReference {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(element: any | undefined): element is URIIconReference {
        return !!element && typeof element === 'object' && 'kind' in element && element['kind'] === 'uriIconReference';
    }
    export function create(id: URIIconReference['id'], uri?: URI): URIIconReference {
        return { kind: 'uriIconReference', id, uri };
    }
}

@injectable()
export class DefaultUriLabelProviderContribution implements LabelProviderContribution {

    canHandle(element: object): number {
        if (element instanceof URI || URIIconReference.is(element)) {
            return 1;
        }
        return 0;
    }

    getIcon(element: URI | URIIconReference): string {
        if (URIIconReference.is(element) && element.id === 'folder') {
            return this.defaultFolderIcon;
        }
        const uri = URIIconReference.is(element) ? element.uri : element;
        if (uri) {
            const iconClass = uri && this.getFileIcon(uri);
            return iconClass || this.defaultFileIcon;
        }
        return '';
    }

    get defaultFolderIcon(): string {
        return DEFAULT_FOLDER_ICON;
    }

    get defaultFileIcon(): string {
        return DEFAULT_FILE_ICON;
    }

    protected getFileIcon(uri: URI): string | undefined {
        const fileIcon = fileIcons.getClassWithColor(uri.displayName);
        if (!fileIcon) {
            return undefined;
        }
        return fileIcon + ' theia-file-icons-js';
    }

    getName(element: URI | URIIconReference): string | undefined {
        const uri = this.getUri(element);
        return uri && uri.displayName;
    }

    getLongName(element: URI | URIIconReference): string | undefined {
        const uri = this.getUri(element);
        return uri && uri.path.toString();
    }

    protected getUri(element: URI | URIIconReference): URI | undefined {
        return URIIconReference.is(element) ? element.uri : element;
    }
}

@injectable()
export class LabelProvider implements FrontendApplicationContribution {

    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();

    @inject(ContributionProvider) @named(LabelProviderContribution)
    protected readonly contributionProvider: ContributionProvider<LabelProviderContribution>;

    /**
     * Start listening to contributions.
     *
     * Don't call this method directly!
     * It's called by the frontend application during initialization.
     */
    initialize(): void {
        const contributions = this.contributionProvider.getContributions();
        for (const eventContribution of contributions) {
            if (eventContribution.onDidChange) {
                eventContribution.onDidChange(event => {
                    this.onDidChangeEmitter.fire({
                        // TODO check eventContribution.canHandle as well
                        affects: element => this.affects(element, event)
                    });
                });
            }
        }
    }

    protected affects(element: object, event: DidChangeLabelEvent): boolean {
        if (event.affects(element)) {
            return true;
        }
        for (const contribution of this.findContribution(element)) {
            if (contribution.affects && contribution.affects(element, event)) {
                return true;
            }
        }
        return false;
    }

    get onDidChange(): Event<DidChangeLabelEvent> {
        return this.onDidChangeEmitter.event;
    }

    /**
     * Return a default file icon for the current icon theme.
     */
    get fileIcon(): string {
        return this.getIcon(URIIconReference.create('file'));
    }

    /**
     * Return a default folder icon for the current icon theme.
     */
    get folderIcon(): string {
        return this.getIcon(URIIconReference.create('folder'));
    }

    getIcon(element: object): string {
        const contributions = this.findContribution(element);
        for (const contribution of contributions) {
            const value = contribution.getIcon && contribution.getIcon(element);
            if (value === undefined) {
                continue;
            }
            return value;
        }
        return '';
    }

    getName(element: object): string {
        const contributions = this.findContribution(element);
        for (const contribution of contributions) {
            const value = contribution.getName && contribution.getName(element);
            if (value === undefined) {
                continue;
            }
            return value;
        }
        return '<unknown>';
    }

    getLongName(element: object): string {
        const contributions = this.findContribution(element);
        for (const contribution of contributions) {
            const value = contribution.getLongName && contribution.getLongName(element);
            if (value === undefined) {
                continue;
            }
            return value;
        }
        return '';
    }

    protected findContribution(element: object): LabelProviderContribution[] {
        const prioritized = Prioritizeable.prioritizeAllSync(this.contributionProvider.getContributions(), contrib =>
            contrib.canHandle(element)
        );
        return prioritized.map(c => c.value);
    }
}
