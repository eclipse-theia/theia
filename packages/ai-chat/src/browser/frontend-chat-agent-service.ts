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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core';
import { AIPreferenceService } from '@theia/ai-core/lib/browser';
import { ChatAgentServiceImpl } from '../common/chat-agent-service';

/**
 * Customizes the ChatAgentServiceImpl to read the default chat agent preference
 * through the trust-aware {@link AIPreferenceService}.
 */
@injectable()
export class FrontendChatAgentServiceImpl extends ChatAgentServiceImpl {

    @inject(AIPreferenceService) @optional()
    protected override readonly preferenceService: PreferenceService | undefined;
}
