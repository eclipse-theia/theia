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

/**
 * Each widget which holds an uri to a workspace file and wants to be able to reveal that file in navigator,
 * (e.g. editor, image viewer, diff editor, etc.) has to implement this interface and provide the file uri on demand.
 * No additional registration is needed.
 */
export interface Navigatable {
    getTargetUri(): URI | undefined;
}

export namespace Navigatable {
    export function is(arg: Object | undefined): arg is Navigatable {
        return !!arg && 'getTargetUri' in arg && typeof (arg as any).getTargetUri === 'function';
    }
}
