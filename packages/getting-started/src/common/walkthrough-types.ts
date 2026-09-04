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

import { WalkthroughStepMedia } from '@theia/plugin-ext/lib/common/plugin-protocol';

/**
 * A step as it is contributed, before the service tracks its completion.
 */
export interface WalkthroughStepDefinition {
    id: string;
    title: string;
    description: string;
    media?: WalkthroughStepMedia;
    completionEvents?: string[];
    when?: string;
}

/**
 * A walkthrough as it is contributed, either by a plugin or by a `WalkthroughProvider`.
 */
export interface WalkthroughDefinition {
    id: string;
    title: string;
    description: string;
    steps: WalkthroughStepDefinition[];
    when?: string;
    /** Name of the codicon shown on the card and in the detail header, without the `codicon-` prefix. */
    icon?: string;
}

export interface WalkthroughStep extends WalkthroughStepDefinition {
    isComplete: boolean;
}

export interface Walkthrough extends WalkthroughDefinition {
    steps: WalkthroughStep[];
    /** Id of the contributing plugin, or `undefined` for a walkthrough contributed by a Theia extension. */
    pluginId?: string;
    /** Icon of the contributing extension, as a backend relative path. */
    pluginIcon?: string;
}
