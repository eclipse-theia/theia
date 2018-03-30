/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { HostedExtensionManagerExt, Extension } from '../api/extension-api';

export interface PluginHost {
    loadExtension(scriptPath: string): void;

    stopExtensions(): void;
}

export class HostedExtensionManagerExtImpl implements HostedExtensionManagerExt {

    constructor(private readonly host: PluginHost) {
    }

    loadExtension(ext: Extension): void {
        this.host.loadExtension(ext.extPath);
    }

    stopExtensions(): PromiseLike<void> {
        this.host.stopExtensions();
        return Promise.resolve();
    }

}
