/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { Disposable } from './disposable-util';
import { PluginMessageReader } from './plugin-message-reader';
import { PluginMessageWriter } from './plugin-message-writer';

/**
 * The container for message reader and writer which can be used to create connection between plugins and main side.
 */
export class PluginConnection implements Disposable {
    reader: PluginMessageReader;
    writer: PluginMessageWriter;
    clearConnection: () => void;

    constructor(protected readonly pluginMessageReader: PluginMessageReader,
        protected readonly pluginMessageWriter: PluginMessageWriter,
        dispose: () => void) {
        this.reader = pluginMessageReader;
        this.writer = pluginMessageWriter;
        this.clearConnection = dispose;
    }

    /**
     * Has to be called when the connection was closed.
     */
    dispose(): void {
        this.clearConnection();
    }
}
