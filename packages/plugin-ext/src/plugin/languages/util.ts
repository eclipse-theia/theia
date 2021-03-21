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

import * as theia from '@theia/plugin';
import * as types from '../types-impl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLocationArray(array: any): array is types.Location[] {
    return Array.isArray(array) && array.length > 0 && array[0] instanceof types.Location;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDefinitionLinkArray(array: any): array is theia.DefinitionLink[] {
    return Array.isArray(array) && array.length > 0 && array[0].hasOwnProperty('targetUri') && array[0].hasOwnProperty('targetRange');
}
