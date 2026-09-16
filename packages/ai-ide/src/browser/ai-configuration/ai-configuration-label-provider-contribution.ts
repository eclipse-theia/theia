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

import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { injectable } from '@theia/core/shared/inversify';
import { AI_CONFIGURATION_RESOURCE_SCHEME } from './ai-configuration-resource';

/**
 * Labels the AI Configuration view's constant resource URI (see {@link AI_CONFIGURATION_RESOURCE_URI}).
 * The view is a {@link NavigatableWidget} so the shell renders breadcrumbs for it; without this, the
 * window title updater would fall back to the URI's (empty) path and show `/` instead of a readable name.
 */
@injectable()
export class AiConfigurationLabelProviderContribution implements LabelProviderContribution {

    canHandle(element: object): number {
        return element instanceof URI && element.scheme === AI_CONFIGURATION_RESOURCE_SCHEME ? 200 : 0;
    }

    getName(): string {
        return nls.localize('theia/ai/ide/aiConfiguration/breadcrumbRoot', 'AI Configuration');
    }

    getLongName(): string {
        return this.getName();
    }

    getIcon(): string {
        return codicon('settings-gear');
    }
}
