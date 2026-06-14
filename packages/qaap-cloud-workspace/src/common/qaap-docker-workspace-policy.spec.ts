// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    QAAP_AGENT_MAX_CPU_PERCENT_ENV,
    QAAP_AGENT_MAX_MEMORY_MB_ENV,
} from './qaap-agent-resource-policy';
import {
    buildDockerWorkspaceContainerEnv,
    buildDockerWorkspaceHostConfig,
    QAAP_DOCKER_NETWORK_MODE_ENV,
    QAAP_DOCKER_WORKSPACE_CPUS_ENV,
    QAAP_DOCKER_WORKSPACE_MEMORY_MB_ENV,
    resolveDockerWorkspacePolicy,
} from './qaap-docker-workspace-policy';

describe('resolveDockerWorkspacePolicy', () => {
    it('defaults to bridge networking and sandbox env', () => {
        const policy = resolveDockerWorkspacePolicy({});
        expect(policy.networkMode).to.equal('bridge');
        expect(policy.injectSandboxEnv).to.be.true;
        expect(policy.memoryMb).to.be.undefined;
        expect(policy.cpus).to.be.undefined;
    });

    it('falls back agent memory/cpu env vars for workspace containers', () => {
        const policy = resolveDockerWorkspacePolicy({
            [QAAP_AGENT_MAX_MEMORY_MB_ENV]: '512',
            [QAAP_AGENT_MAX_CPU_PERCENT_ENV]: '150',
        });
        expect(policy.memoryMb).to.equal(512);
        expect(policy.cpus).to.equal(1.5);
    });

    it('prefers docker-specific overrides', () => {
        const policy = resolveDockerWorkspacePolicy({
            [QAAP_DOCKER_WORKSPACE_MEMORY_MB_ENV]: '768',
            [QAAP_DOCKER_WORKSPACE_CPUS_ENV]: '2',
            [QAAP_AGENT_MAX_MEMORY_MB_ENV]: '512',
            [QAAP_DOCKER_NETWORK_MODE_ENV]: 'none',
        });
        expect(policy.memoryMb).to.equal(768);
        expect(policy.cpus).to.equal(2);
        expect(policy.networkMode).to.equal('none');
    });
});

describe('buildDockerWorkspaceHostConfig', () => {
    it('maps memory and cpus to Docker host limits', () => {
        const hostConfig = buildDockerWorkspaceHostConfig({
            memoryMb: 1024,
            cpus: 1.5,
            networkMode: 'bridge',
            injectSandboxEnv: true,
        });
        expect(hostConfig.Memory).to.equal(1024 * 1024 * 1024);
        expect(hostConfig.MemorySwap).to.equal(hostConfig.Memory);
        expect(hostConfig.NanoCPUs).to.equal(1_500_000_000);
        expect(hostConfig.NetworkMode).to.be.undefined;
    });

    it('sets NetworkMode when not bridge', () => {
        const hostConfig = buildDockerWorkspaceHostConfig({
            networkMode: 'none',
            injectSandboxEnv: true,
        });
        expect(hostConfig.NetworkMode).to.equal('none');
    });
});

describe('buildDockerWorkspaceContainerEnv', () => {
    it('injects IS_SANDBOX by default', () => {
        expect(buildDockerWorkspaceContainerEnv({
            networkMode: 'bridge',
            injectSandboxEnv: true,
        })).to.deep.equal(['IS_SANDBOX=1']);
    });

    it('returns undefined when sandbox env is disabled', () => {
        expect(buildDockerWorkspaceContainerEnv({
            networkMode: 'bridge',
            injectSandboxEnv: false,
        })).to.be.undefined;
    });
});
