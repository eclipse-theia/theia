// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { isFunction, isObject } from '../../common';

export interface PreviewableWidget {
    loaded?: boolean;
    getPreviewNode(): Node | undefined;
}

export namespace PreviewableWidget {
    export function is(arg: unknown): arg is PreviewableWidget {
        return isObject<PreviewableWidget>(arg) && isFunction(arg.getPreviewNode);
    }
    export function isPreviewable(arg: unknown): arg is PreviewableWidget {
        return isObject<PreviewableWidget>(arg) && isFunction(arg.getPreviewNode) && arg.loaded === true;
    }
}
