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

import { injectable } from 'inversify';
import { nls } from '../common/nls.js';
import { terminalAnsiColorMap } from '../common/terminal-ansi-color-map.js';
import { ColorContribution } from './color-application-contribution.js';
import { ColorRegistry } from './color-registry.js';

/**
 * Registers the 16 `terminal.ansi*` colors. They live in core because ANSI-colored output is rendered
 * outside the terminal too, e.g. by core's `ansi.css` and the output view.
 */
@injectable()
export class TerminalAnsiColorContribution implements ColorContribution {
    registerColors(colors: ColorRegistry): void {
        // eslint-disable-next-line guard-for-in
        for (const id in terminalAnsiColorMap) {
            const entry = terminalAnsiColorMap[id];
            const colorName = id.substring('terminal.ansi'.length);
            colors.register({
                id,
                defaults: entry.defaults,
                description: nls.localizeByDefault("'{0}' ANSI color in the terminal.", colorName)
            });
        }
    }
}
