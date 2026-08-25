// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';

/**
 * Defaults to `<electron-uri-scheme>://install-plugin`; products override by rebinding this class.
 * The registry generates per-entry install URLs with the same scheme and authority.
 */
@injectable()
export class InstallPluginUriConfiguration {

    /** Must match `theia.frontend.config.electron.uriScheme` in the product's `package.json`. */
    getScheme(): string {
        return FrontendApplicationConfigProvider.get().electron?.uriScheme ?? 'theia';
    }

    getAuthority(): string {
        return 'install-plugin';
    }
}
