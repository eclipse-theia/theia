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
import { AiConfigurationCategoryRenderer, AiConfigurationRenderContext } from '../ai-configuration-category';

/**
 * Convenience base for `single-page` categories. Subclasses implement
 * {@link renderSections} (and optionally {@link renderHeader}); the page frame
 * and scrolling container are provided.
 */
export abstract class SinglePageCategoryRenderer implements AiConfigurationCategoryRenderer {

    renderPage(ctx: AiConfigurationRenderContext): React.ReactNode {
        return <div className='ai-configuration-page'>
            {this.renderHeader(ctx)}
            {this.renderSections(ctx)}
        </div>;
    }

    /** Optional page header (title/description); nothing by default. */
    protected renderHeader(ctx: AiConfigurationRenderContext): React.ReactNode {
        return undefined;
    }

    /** The page body: typically one or more {@link AiConfigurationSection}s of rows. */
    protected abstract renderSections(ctx: AiConfigurationRenderContext): React.ReactNode;
}
