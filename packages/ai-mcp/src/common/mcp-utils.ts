// *****************************************************************************
// Copyright (C) 2026 Abdelrahman Sharaf.
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
 * Sanitizes MCP server names to comply with the pattern `^[a-zA-Z0-9_-]+$`
 * by replacing spaces with underscores and removing special characters.
 */
export function sanitizeMCPName(name: string): string {
    return name
        .trim()
        .replace(/\s/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}
