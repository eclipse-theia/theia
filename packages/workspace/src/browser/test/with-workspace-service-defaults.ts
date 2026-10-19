// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { WorkspaceService } from '../workspace-service';

/**
 * Turns a partial mock of the workspace service into one that falls back to the real
 * `WorkspaceService` methods for anything it does not stub, such as the root naming that
 * is computed from `tryGetRoots()`. The mock is modified in place and returned.
 */
export function withWorkspaceServiceDefaults(mock: object): WorkspaceService {
    return Object.setPrototypeOf(mock, WorkspaceService.prototype);
}
