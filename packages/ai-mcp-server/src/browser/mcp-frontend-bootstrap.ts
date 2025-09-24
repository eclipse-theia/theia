// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { MaybePromise } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';
import { MCPToolFrontendDelegate } from '../common/mcp-tool-delegate';

/**
 * Bootstraps MCP frontend components during application startup.
 *
 * This contribution ensures that the MCPToolFrontendDelegate is properly instantiated
 * and available in the dependency injection container when the frontend application starts.
 * It acts as a lightweight initializer to activate MCP functionality in the browser.
 */
@injectable()
export class MCPFrontendBootstrap implements FrontendApplicationContribution {

    @inject(MCPToolFrontendDelegate)
    protected readonly frontendDelegate: MCPToolFrontendDelegate;

    @inject(ILogger)
    protected readonly logger: ILogger;

    onStart(_app: FrontendApplication): MaybePromise<void> {
        this.logger.debug('MCPFrontendBootstrap initialized');
    }

}
