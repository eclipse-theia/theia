// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { CompressionParent, TreeCompressionService } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import { WorkspaceRootNode } from './navigator-tree';

/**
 * Does not compact the roots of a multi-root workspace with their folders, as VS Code does, so that
 * the name of a root, which may be a path like `alice/app`, is not taken for a part of the compacted path.
 */
@injectable()
export class FileNavigatorTreeCompressionService extends TreeCompressionService {

    override isCompressionParent(node?: unknown): node is CompressionParent {
        return !WorkspaceRootNode.is(node) && super.isCompressionParent(node);
    }
}
