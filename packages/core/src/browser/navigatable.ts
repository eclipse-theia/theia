// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import URI from '../common/uri';
import { WidgetOpenHandler, WidgetOpenerOptions } from './widget-open-handler';
import { NavigatableWidget, NavigatableWidgetOptions } from './navigatable-types';
export * from './navigatable-types';

export abstract class NavigatableWidgetOpenHandler<W extends NavigatableWidget> extends WidgetOpenHandler<W> {

    protected createWidgetOptions(uri: URI, options?: WidgetOpenerOptions): NavigatableWidgetOptions {
        return {
            kind: 'navigatable',
            uri: this.serializeUri(uri)
        };
    }

    protected serializeUri(uri: URI): string {
        if (uri.scheme === 'file') {
            return uri.withoutFragment().normalizePath().toString();
        } else {
            return uri.withoutFragment().toString();
        }
    }

}
