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

import { expect } from 'chai';
import { getWorkspaceMounts, inferWorkspacePath, isWorkspaceMount, MountInfo } from './devcontainer-util';
import type { ContainerInspectInfo } from 'dockerode';

function createContainerInfo(
    mounts: Array<{ Destination: string; Type?: string }>,
    workingDir?: string
): ContainerInspectInfo {
    return {
        Mounts: mounts.map(m => ({ ...m, Type: m.Type ?? 'bind' })),
        Config: { WorkingDir: workingDir ?? '' }
    } as unknown as ContainerInspectInfo;
}

describe('inferWorkspacePath', () => {

    it('should return workspace mount destination', () => {
        const info = createContainerInfo([{ Destination: '/workspaces/project' }]);
        expect(inferWorkspacePath(info)).to.equal('/workspaces/project');
    });

    it('should skip .ssh mount', () => {
        const info = createContainerInfo([
            { Destination: '/root/.ssh' },
            { Destination: '/workspaces/project' }
        ]);
        expect(inferWorkspacePath(info)).to.equal('/workspaces/project');
    });

    it('should skip .gitconfig mount', () => {
        const info = createContainerInfo([
            { Destination: '/home/user/.gitconfig' },
            { Destination: '/workspaces/project' }
        ]);
        expect(inferWorkspacePath(info)).to.equal('/workspaces/project');
    });

    it('should skip /tmp/host_gitconfig mount', () => {
        const info = createContainerInfo([
            { Destination: '/tmp/host_gitconfig' },
            { Destination: '/workspaces/project' }
        ]);
        expect(inferWorkspacePath(info)).to.equal('/workspaces/project');
    });

    it('should skip all injected mounts and find workspace', () => {
        const info = createContainerInfo([
            { Destination: '/root/.ssh' },
            { Destination: '/tmp/host_gitconfig' },
            { Destination: '/workspace' }
        ]);
        expect(inferWorkspacePath(info)).to.equal('/workspace');
    });

    it('should fall back to WorkingDir when no suitable mounts', () => {
        const info = createContainerInfo([{ Destination: '/root/.ssh' }], '/app');
        expect(inferWorkspacePath(info)).to.equal('/app');
    });

    it('should fall back to / when no mounts and no WorkingDir', () => {
        const info = createContainerInfo([], '');
        expect(inferWorkspacePath(info)).to.equal('/');
    });

    it('should fall back to / when mounts is empty', () => {
        const info = createContainerInfo([]);
        expect(inferWorkspacePath(info)).to.equal('/');
    });

    it('should skip non-bind mounts', () => {
        const info = createContainerInfo([
            { Destination: '/data', Type: 'volume' },
            { Destination: '/workspaces/project' }
        ]);
        expect(inferWorkspacePath(info)).to.equal('/workspaces/project');
    });
});

describe('isWorkspaceMount', () => {

    function mount(destination: string, type: string = 'bind'): MountInfo {
        return { Destination: destination, Type: type } as MountInfo;
    }

    it('should accept a normal bind mount', () => {
        expect(isWorkspaceMount(mount('/workspaces/project'))).to.be.true;
    });

    it('should reject .ssh mounts', () => {
        expect(isWorkspaceMount(mount('/root/.ssh'))).to.be.false;
    });

    it('should reject .gitconfig mounts', () => {
        expect(isWorkspaceMount(mount('/home/user/.gitconfig'))).to.be.false;
    });

    it('should reject /tmp/host_gitconfig', () => {
        expect(isWorkspaceMount(mount('/tmp/host_gitconfig'))).to.be.false;
    });

    it('should reject volume mounts', () => {
        expect(isWorkspaceMount(mount('/workspaces/project', 'volume'))).to.be.false;
    });

    it('should reject tmpfs mounts', () => {
        expect(isWorkspaceMount(mount('/workspaces/project', 'tmpfs'))).to.be.false;
    });
});

describe('getWorkspaceMounts', () => {

    function mount(destination: string, type: string = 'bind'): MountInfo {
        return { Destination: destination, Type: type } as MountInfo;
    }

    it('should filter out injected mounts and return workspace mounts', () => {
        const mounts = [
            mount('/root/.ssh'),
            mount('/workspaces/project'),
            mount('/tmp/host_gitconfig'),
            mount('/app'),
        ];
        const result = getWorkspaceMounts(mounts);
        expect(result.map(m => m.Destination)).to.deep.equal(['/workspaces/project', '/app']);
    });

    it('should return empty array when all mounts are injected', () => {
        const mounts = [
            mount('/root/.ssh'),
            mount('/home/user/.gitconfig'),
        ];
        expect(getWorkspaceMounts(mounts)).to.deep.equal([]);
    });

    it('should return empty array for empty input', () => {
        expect(getWorkspaceMounts([])).to.deep.equal([]);
    });
});
