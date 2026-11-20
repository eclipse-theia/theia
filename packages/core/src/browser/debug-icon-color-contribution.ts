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
import { ColorContribution } from './color-application-contribution.js';
import { ColorRegistry } from './color-registry.js';

/**
 * Registers the `debugIcon.startForeground` and `debugIcon.stopForeground` colors. They live in core because
 * the start and stop icons are used outside `@theia/debug` too, e.g. by Monaco's run code lenses, the notebook
 * run indicators and the cancel button of the AI shell execution tool.
 */
@injectable()
export class DebugIconColorContribution implements ColorContribution {
    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'debugIcon.startForeground', defaults: {
                    dark: '#89D185',
                    light: '#388A34',
                    hcDark: '#89D185',
                    hcLight: '#388A34'
                }, description: nls.localizeByDefault('Debug toolbar icon for start debugging.')
            },
            {
                id: 'debugIcon.stopForeground', defaults: {
                    dark: '#F48771',
                    light: '#A1260D',
                    hcDark: '#F48771',
                    hcLight: '#A1260D'
                }, description: nls.localizeByDefault('Debug toolbar icon for stop.')
            }
        );
    }
}
