// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Widget } from '../widgets';
import { ApplicationShell } from './application-shell';

export const ShellLayoutContribution = Symbol('ShellLayoutContribution');

export interface ShellLayoutContribution {
    /**
     * The area the panel is contributed to.
     * Currently, only 'top' is supported.
     *
     * Defaults to `top`.
     */
    area?: 'top';
    /**
     * Priority of the panel compared to other contributed panels.
     * A higher priority means the panel will appear first.
     *
     * Defaults to `100`.
     */
    priority?: number;
    /**
     * A factory method for creating a contributed panel.
     */
    createPanel(applicationShell: ApplicationShell): Widget;
}
