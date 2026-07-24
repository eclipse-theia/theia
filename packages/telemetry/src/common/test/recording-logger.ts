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

import { Loggable } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

export class RecordingLogger extends MockLogger {
    readonly warnings: string[] = [];
    readonly errors: string[] = [];

    override warn(arg: string | Loggable, ...params: unknown[]): Promise<void> {
        this.warnings.push(String(arg), ...params.map(String));
        return Promise.resolve();
    }

    override error(arg: string | Loggable | Error, ...params: unknown[]): Promise<void> {
        this.errors.push(String(arg), ...params.map(String));
        return Promise.resolve();
    }
}
