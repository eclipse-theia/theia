// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { URI, isObject, MaybeArray } from '../common';
import { Widget, BaseWidget } from './widgets';

/**
 * `Navigatable` provides an access to an URI of an underlying instance of `Resource`.
 */
export interface Navigatable {
    /**
     * Return an underlying resource URI.
     */
    getResourceUri(): URI | undefined;
    /**
     * Creates a new URI to which this navigatable should moved based on the given target resource URI.
     */
    createMoveToUri(resourceUri: URI): URI | undefined;
}

export namespace Navigatable {
    export function is(arg: unknown): arg is Navigatable {
        return isObject(arg) && 'getResourceUri' in arg && 'createMoveToUri' in arg;
    }
}

export type NavigatableWidget = BaseWidget & Navigatable;
export namespace NavigatableWidget {
    export function is(arg: unknown): arg is NavigatableWidget {
        return arg instanceof BaseWidget && Navigatable.is(arg);
    }
    export function* getAffected<T extends Widget>(
        widgets: Iterable<T>,
        context: MaybeArray<URI>
    ): IterableIterator<[URI, T & NavigatableWidget]> {
        const uris = Array.isArray(context) ? context : [context];
        return get(widgets, resourceUri => uris.some(uri => uri.isEqualOrParent(resourceUri)));
    }
    export function* get<T extends Widget>(
        widgets: Iterable<T>,
        filter: (resourceUri: URI) => boolean = () => true
    ): IterableIterator<[URI, T & NavigatableWidget]> {
        for (const widget of widgets) {
            if (NavigatableWidget.is(widget)) {
                const resourceUri = widget.getResourceUri();
                if (resourceUri && filter(resourceUri)) {
                    yield [resourceUri, widget];
                }
            }
        }
    }
    export function getUri(widget?: Widget): URI | undefined {
        if (is(widget)) {
            return widget.getResourceUri();
        }
    }
}

export interface NavigatableWidgetOptions {
    kind: 'navigatable';
    uri: string;
    counter?: number;
}
export namespace NavigatableWidgetOptions {
    export function is(arg: unknown): arg is NavigatableWidgetOptions {
        return isObject(arg) && arg.kind === 'navigatable';
    }
}
