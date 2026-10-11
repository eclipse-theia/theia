// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import URI from '@theia/core/lib/common/uri';

/** URI scheme identifying the AI Configuration view for Theia's breadcrumbs infrastructure. */
export const AI_CONFIGURATION_RESOURCE_SCHEME = 'ai-configuration';

/**
 * The stable resource URI of the AI Configuration view. It is constant (the current
 * category/item is read from the selection model), mirroring how an editor keeps its file URI
 * while its breadcrumb content changes with the cursor.
 */
export const AI_CONFIGURATION_RESOURCE_URI = new URI(`${AI_CONFIGURATION_RESOURCE_SCHEME}:/`);
