// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { MaybePromise, Event } from '../../common';
import { Disposable } from '../../../shared/vscode-languageserver-protocol';
import URI from '../../common/uri';

export namespace Styles {
    export const BREADCRUMBS = 'theia-breadcrumbs';
    export const BREADCRUMB_ITEM = 'theia-breadcrumb-item';
    export const BREADCRUMB_POPUP_OVERLAY_CONTAINER = 'theia-breadcrumbs-popups-overlay';
    export const BREADCRUMB_POPUP = 'theia-breadcrumbs-popup';
    export const BREADCRUMB_ITEM_HAS_POPUP = 'theia-breadcrumb-item-haspopup';
}

/** A single breadcrumb in the breadcrumbs bar. */
export interface Breadcrumb {

    /** An ID of this breadcrumb that should be unique in the breadcrumbs bar. */
    readonly id: string;

    /** The breadcrumb type. Should be the same as the contribution type `BreadcrumbsContribution#type`. */
    readonly type: symbol;

    /** The text that will be rendered as label. */
    readonly label: string;

    /** A longer text that will be used as tooltip text. */
    readonly longLabel: string;

    /** A CSS class for the icon. */
    readonly iconClass?: string;

    /** CSS classes for the container. */
    readonly containerClass?: string;
}

export const BreadcrumbsContribution = Symbol('BreadcrumbsContribution');
export interface BreadcrumbsContribution {

    /**
     * The breadcrumb type. Breadcrumbs returned by `#computeBreadcrumbs(uri)` should have this as `Breadcrumb#type`.
     */
    readonly type: symbol;

    /**
     * The priority of this breadcrumbs contribution. Contributions are rendered left to right in order of ascending priority.
     */
    readonly priority: number;

    /**
     * An event emitter that should fire when breadcrumbs change for a given URI.
     */
    readonly onDidChangeBreadcrumbs: Event<URI>;

    /**
     * Computes breadcrumbs for a given URI.
     */
    computeBreadcrumbs(uri: URI): MaybePromise<Breadcrumb[]>;

    /**
     * Attaches the breadcrumb popup content for the given breadcrumb as child to the given parent.
     * If it returns a Disposable, it is called when the popup closes.
     */
    attachPopupContent(breadcrumb: Breadcrumb, parent: HTMLElement): Promise<Disposable | undefined>;
}
