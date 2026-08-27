// *****************************************************************************
// Copyright (C) 2026 robertjndw
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { BrowserOnlyTerminalFrontendContribution } from './browser-only-terminal-frontend-contribution';
import { TerminalFrontendContribution } from '../browser/terminal-frontend-contribution';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    // `TerminalService`, `FrontendApplicationContribution`, `CommandContribution` and the other
    // contribution points bound in `terminal-frontend-module.ts` are all resolved via
    // `toService(TerminalFrontendContribution)`, so rebinding the contribution itself is what
    // makes every one of those paths go through the browser-only implementation.
    rebind(TerminalFrontendContribution).to(BrowserOnlyTerminalFrontendContribution).inSingletonScope();
});
