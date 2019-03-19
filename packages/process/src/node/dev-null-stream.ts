/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import stream = require('stream');

/**
 * A Node stream like `/dev/null`.
 *
 * Writing goes to a black hole, reading returns `EOF`.
 */
export class DevNullStream extends stream.Duplex {
    // tslint:disable-next-line:no-any
    _write(chunk: any, encoding: string, callback: (err?: Error) => void): void {
        callback();
    }

    _read(size: number): void {
        // tslint:disable-next-line:no-null-keyword
        this.push(null);
    }
}
