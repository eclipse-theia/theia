/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import URI from '../common/uri';
import { BaseWidget } from './widgets';
import { WidgetOpenHandler, WidgetOpenerOptions } from './widget-open-handler';

/**
 * Each widget which holds an uri to a workspace file and wants to be able to reveal that file in navigator,
 * (e.g. editor, image viewer, diff editor, etc.) has to implement this interface and provide the file uri on demand.
 * No additional registration is needed.
 */
export interface Navigatable {
    /**
     * Return an underlying file uri.
     */
    getTargetUri(): URI | undefined;
    /**
     * Return a source uri for the given file URI.
     */
    getSourceUri(targetUri: URI): URI | undefined;
}

export namespace Navigatable {
    export function is(arg: Object | undefined): arg is Navigatable {
        return !!arg && 'getTargetUri' in arg && typeof (arg as any).getTargetUri === 'function';
    }
}

export type NavigatableWidget = BaseWidget & Navigatable;
export namespace NavigatableWidget {
    export function is(arg: Object | undefined): arg is NavigatableWidget {
        return arg instanceof BaseWidget && Navigatable.is(arg);
    }
}

export interface NavigatableWidgetOptions {
    kind: 'navigatable',
    uri: string
}
export namespace NavigatableWidgetOptions {
    export function is(arg: Object | undefined): arg is NavigatableWidgetOptions {
        return !!arg && 'kind' in arg && (arg as any).kind === 'navigatable';
    }
}

export abstract class NavigatableWidgetOpenHandler<W extends NavigatableWidget> extends WidgetOpenHandler<W> {

    protected createWidgetOptions(uri: URI, options?: WidgetOpenerOptions): NavigatableWidgetOptions {
        return {
            kind: 'navigatable',
            uri: this.serializeUri(uri)
        };
    }

    protected serializeUri(uri: URI): string {
        return uri.withoutFragment().toString();
    }

}
