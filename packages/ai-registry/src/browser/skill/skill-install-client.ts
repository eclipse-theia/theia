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

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { SkillInstallClient } from '../../common/skill/skill-install-protocol';

/**
 * Frontend endpoint for the backend's skill-folder watcher. The backend invokes
 * {@link notifyDidChangeInstalledSkills} over RPC whenever `~/.agents/skills` changes;
 * consumers (the Extensions view contribution) subscribe to {@link onDidChangeInstalledSkills}
 * to refresh their cards.
 */
@injectable()
export class SkillInstallClientImpl implements SkillInstallClient {

    protected readonly onDidChangeInstalledSkillsEmitter = new Emitter<void>();
    readonly onDidChangeInstalledSkills: Event<void> = this.onDidChangeInstalledSkillsEmitter.event;

    protected readonly onDidStopWatchingEmitter = new Emitter<void>();
    readonly onDidStopWatching: Event<void> = this.onDidStopWatchingEmitter.event;

    notifyDidChangeInstalledSkills(): void {
        this.onDidChangeInstalledSkillsEmitter.fire();
    }

    notifyWatcherStopped(): void {
        this.onDidStopWatchingEmitter.fire();
    }
}
