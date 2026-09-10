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

import { injectable } from '@theia/core/shared/inversify';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { LaunchArgv } from '@theia/core/lib/common/window';

/**
 * Claims windows opened for a CLI `--attach-container` launch. Such a window is opened empty and
 * reloads into the container once the attach completes; claiming it lets core open an empty window
 * (instead of restoring the last workspace) and flag it so the dev-container frontend can show its
 * "attaching" screen from the first paint. Keeps the knowledge of `--attach-container` in
 * `@theia/dev-container` rather than in core.
 */
@injectable()
export class DevContainerClaimContribution implements ElectronMainApplicationContribution {

    claimsWindow(argv: string[]): boolean {
        return LaunchArgv.getValue(argv, 'attach-container') !== undefined;
    }
}
