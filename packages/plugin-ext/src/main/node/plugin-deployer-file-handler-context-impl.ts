// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { PluginDeployerEntry, PluginDeployerFileHandlerContext } from '../../common/plugin-protocol';
import { ArchiveExtractor, ArchiveExtractorImpl } from '@theia/filesystem/lib/node/archive/archive-extractor';

export class PluginDeployerFileHandlerContextImpl implements PluginDeployerFileHandlerContext {

    constructor(
        private readonly pluginDeployerEntry: PluginDeployerEntry,
        protected readonly archiveExtractor: ArchiveExtractor = new ArchiveExtractorImpl()
    ) {

    }

    async unzip(sourcePath: string, destPath: string): Promise<void> {
        await this.archiveExtractor.extract(sourcePath, destPath);
    }

    pluginEntry(): PluginDeployerEntry {
        return this.pluginDeployerEntry;
    }
}
