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

import * as React from '@theia/core/shared/react';
import { Event } from '@theia/core';

/**
 * Contribution point for compact, persistent banners shown above the chat view
 * content (between the tab title and the message list). Unlike {@link ChatWelcomeMessageProvider},
 * these banners stay visible while the user is actively chatting.
 *
 * Implementations should return `undefined` from {@link renderBanner} when there
 * is nothing to show, so the host can collapse to zero height.
 */
export const ChatBannerProvider = Symbol('ChatBannerProvider');
export interface ChatBannerProvider {
    /** Optional priority for rendering order. Higher values render first. Default: 0. */
    readonly priority?: number;
    /** Fired when the banner content (or visibility) may have changed. */
    readonly onDidChange?: Event<void>;
    /** Render the banner, or `undefined` to hide it. */
    renderBanner(): React.ReactNode | undefined;
}
