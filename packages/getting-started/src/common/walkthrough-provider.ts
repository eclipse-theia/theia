// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Event } from '@theia/core/lib/common/event';
import { WalkthroughDefinition } from './walkthrough-types';

/**
 * Contribution point for walkthroughs provided by a Theia extension, next to the walkthroughs that plugins
 * contribute through their `contributes.walkthroughs` manifest section.
 *
 * Both sources are treated alike: contributed walkthroughs are listed on the welcome page, keep their progress,
 * and can be opened with the `walkthrough.open` command.
 */
export const WalkthroughProvider = Symbol('WalkthroughProvider');
export interface WalkthroughProvider {
    /**
     * The walkthroughs of this provider. Called again whenever {@link onDidChange} fires.
     *
     * The ids are used as they are, so they have to be unique across the application. A walkthrough contributed
     * by a plugin is identified by `<pluginId>.<walkthroughId>`, which a provider must not imitate.
     */
    getWalkthroughs(): WalkthroughDefinition[];
    /** Fired when the result of {@link getWalkthroughs} changed. */
    readonly onDidChange?: Event<void>;
}
