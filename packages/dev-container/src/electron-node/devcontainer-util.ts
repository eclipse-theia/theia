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

import type { ContainerInspectInfo } from 'dockerode';

export type MountInfo = ContainerInspectInfo['Mounts'][number];

/**
 * Returns true for bind mounts that are not injected by HostConfigSharingContribution
 * (SSH dir, gitconfig). Shared by {@link inferWorkspacePath} and
 * {@link getWorkspaceMounts} to keep the filtering logic in one place.
 */
export function isWorkspaceMount(mount: MountInfo): boolean {
    return mount.Type === 'bind'
        && !!mount.Destination
        && !mount.Destination.endsWith('/.ssh')
        && !mount.Destination.endsWith('/.gitconfig')
        && mount.Destination !== '/tmp/host_gitconfig';
}

/**
 * Returns all bind mounts that look like workspace mounts (filtering out
 * injected SSH/gitconfig mounts).
 */
export function getWorkspaceMounts(mounts: MountInfo[]): MountInfo[] {
    return mounts.filter(isWorkspaceMount);
}

/**
 * Infers a workspace path from container inspect info.
 * Takes the first workspace-relevant bind mount, falls back to WorkingDir, then `/`.
 */
export function inferWorkspacePath(containerInfo: ContainerInspectInfo): string {
    const workspaceMount = containerInfo.Mounts.find(isWorkspaceMount);
    return (workspaceMount?.Destination ?? containerInfo.Config.WorkingDir) || '/';
}
