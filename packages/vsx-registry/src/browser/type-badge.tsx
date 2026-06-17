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

import * as React from '@theia/core/shared/react';

export interface TypeBadgeProps {
    /**
     * Icon shown to the left of the label. Either pass a codicon `<i>` (e.g.
     * `<i className="codicon codicon-mcp" />`) or an image `<i>` whose CSS class
     * sets a background-image - anything that renders as a small inline glyph.
     */
    readonly icon: React.ReactNode;
    /** Visible label, e.g. "Extension" or "MCP". */
    readonly label: string;
    /**
     * Variant key used as a CSS modifier (`theia-extensions-type-badge--{variant}`).
     * Distinguishes badges visually (background tint) per contribution type.
     */
    readonly variant: string;
    readonly title?: string;
}

/**
 * Pill-style badge with an icon and a text label, used in the Extensions view to
 * indicate which contribution type an entry came from (e.g. extension vs MCP server).
 */
export const TypeBadge: React.FC<TypeBadgeProps> = ({ icon, label, variant, title }) => (
    <span className={`theia-extensions-type-badge theia-extensions-type-badge--${variant}`} title={title ?? label}>
        {icon}
        <span className="theia-extensions-type-badge-label">{label}</span>
    </span>
);
