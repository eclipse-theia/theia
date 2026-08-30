// *****************************************************************************
// Copyright (C) 2017-2018 TypeFox and others.
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

/**
 * Kept so that the names this module published keep resolving. The service moved to
 * `filesystem-watcher-service-impl`, next to both watchers it routes to rather than only the parcel one, and
 * `ParcelWatcher` moved to `parcel-watcher`. Delete this file once the deprecated names below can go, which
 * per `doc/api-management.md` is a major release.
 */

import { FileSystemWatcher } from '../filesystem-watcher';
import { FileSystemWatcherServiceImpl } from '../filesystem-watcher-service-impl';

export * from './parcel-watcher';
export * from '../filesystem-watcher-service-impl';

/** @deprecated since 1.75.0 - use `FileSystemWatcherServiceImpl`, which also serves non-recursive requests. */
export const ParcelFileSystemWatcherService = FileSystemWatcherServiceImpl;
/** @deprecated since 1.75.0 - use `FileSystemWatcherServiceImpl`, which also serves non-recursive requests. */
export type ParcelFileSystemWatcherService = FileSystemWatcherServiceImpl;

/** @deprecated since 1.75.0 - a watcher id now maps straight to the {@link FileSystemWatcher} serving it. */
export interface PacelWatcherHandle {
    clientId: number;
    watcher: FileSystemWatcher;
}
