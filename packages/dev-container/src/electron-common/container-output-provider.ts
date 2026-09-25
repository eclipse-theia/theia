// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

export interface ContainerOutputProvider {
    onRemoteOutput(output: string): void;
    /**
     * Receives curated status messages (from {@link RemoteStatusReport}) describing the current
     * attach phase, e.g. "Starting application on remote...". Used to drive the "attaching" screen.
     * Optional so that existing implementers of this interface keep compiling.
     */
    onRemoteStatus?(message: string): void;
}
