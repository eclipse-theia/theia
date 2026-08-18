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

import { Endpoint } from '@theia/core/lib/browser/endpoint';

/**
 * Resolves the resources a walkthrough refers to - its media and the icon of the contributing extension.
 *
 * A plugin contributes them as backend relative paths, which have to be resolved against the backend
 * endpoint before the frontend can request them.
 */
export function toWalkthroughResourceUrl(path: string): string {
    return path.startsWith('hostedPlugin/') ? new Endpoint({ path }).getRestUrl().toString() : path;
}
