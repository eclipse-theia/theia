// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics, Ericsson, ARM, EclipseSource and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Widget } from './widget';

/**
 * A contract for widgets that are extractable to a secondary window.
 */
export interface ExtractableWidget extends Widget {
    /** Set to `true` to mark the widget to be extractable. */
    isExtractable: boolean;
    /** The secondary window that the window was extracted to or `undefined` if it is not yet extracted. */
    secondaryWindow: Window | undefined;
}

export namespace ExtractableWidget {
    export function is(widget: unknown): widget is ExtractableWidget {
        return widget instanceof Widget && widget.hasOwnProperty('isExtractable') && (widget as ExtractableWidget).isExtractable === true;
    }
}
