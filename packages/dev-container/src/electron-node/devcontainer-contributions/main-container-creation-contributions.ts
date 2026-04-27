// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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
import * as Docker from 'dockerode';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { ContainerCreationContribution } from '../docker-container-service';
import { DevContainerConfiguration, DockerfileContainer, ImageContainer, NonComposeContainerBase } from '../devcontainer-file';
import { ILogger, Path } from '@theia/core';
import { ContainerOutputProvider } from '../../electron-common/container-output-provider';
import * as fs from '@theia/core/shared/fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';
import { ForwardedPort, RemotePortForwardingProvider } from '@theia/remote/lib/electron-common/remote-port-forwarding-provider';
import { RemoteDockerContainerConnection } from '../remote-container-connection-provider';
import { WorkspaceCreationContribution } from './workspace-creation-contribution';
import { parseWorkspaceMount } from '../dockerode-utils';

export function registerContainerCreationContributions(bind: interfaces.Bind): void {
    bind(ContainerCreationContribution).to(ImageFileContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(DockerFileContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(ForwardPortsContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(MountsContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(RemoteUserContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(PostCreateCommandContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(ContainerEnvContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(WorkspaceCreationContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(HostConfigSharingContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(DefaultShellContribution).inSingletonScope();
}

@injectable()
export class ImageFileContribution implements ContainerCreationContribution {
    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: ImageContainer,
        api: Docker, outputprovider: ContainerOutputProvider): Promise<void> {
        if (containerConfig.image) {
            const platform = process.platform;
            const arch = process.arch;
            const options = platform === 'darwin' && arch === 'arm64' ? { platform: 'amd64' } : {};
            await new Promise<void>((res, rej) => api.pull(containerConfig.image, options, (err, stream) => {
                if (err) {
                    rej(err);
                } else if (stream === undefined) {
                    rej('Stream is undefined');
                } else {
                    api.modem.followProgress(stream!, (error, output) => error ?
                        rej(error) :
                        res(), progress => outputprovider.onRemoteOutput(OutputHelper.parseProgress(progress)));
                }
            }));
            createOptions.Image = containerConfig.image;
        }
    }
}

@injectable()
export class DockerFileContribution implements ContainerCreationContribution {
    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DockerfileContainer,
        api: Docker, outputprovider: ContainerOutputProvider): Promise<void> {
        // check if dockerfile container
        if (containerConfig.dockerFile || containerConfig.build?.dockerfile) {
            const dockerfile = (containerConfig.dockerFile ?? containerConfig.build?.dockerfile) as string;
            const context = containerConfig.context ?? new Path(containerConfig.location as string).dir.fsPath();
            try {
                // ensure dockerfile exists
                await fs.lstat(new Path(context as string).join(dockerfile).fsPath());

                const buildStream = await api.buildImage({
                    context,
                    src: [dockerfile],
                } as Docker.ImageBuildContext, {
                    buildargs: containerConfig.build?.args
                });
                // TODO probably have some console windows showing the output of the build
                const imageId = await new Promise<string>((res, rej) => api.modem.followProgress(buildStream!, (err, outputs) => {
                    if (err) {
                        rej(err);
                    } else {
                        for (let i = outputs.length - 1; i >= 0; i--) {
                            if (outputs[i].aux?.ID) {
                                res(outputs[i].aux.ID);
                                return;
                            }
                        }
                    }
                }, progress => outputprovider.onRemoteOutput(OutputHelper.parseProgress(progress))));
                createOptions.Image = imageId;
            } catch (error) {
                outputprovider.onRemoteOutput(`Could not build dockerfile "${dockerfile}": ${error.message}`);
                throw error;
            }
        }
    }
}

@injectable()
export class ForwardPortsContribution implements ContainerCreationContribution {

    @inject(RemotePortForwardingProvider)
    protected readonly portForwardingProvider: RemotePortForwardingProvider;

    async handlePostConnect(containerConfig: DevContainerConfiguration, connection: RemoteDockerContainerConnection): Promise<void> {
        if (!containerConfig.forwardPorts) {
            return;
        }

        for (const forward of containerConfig.forwardPorts) {
            let port: number;
            let address: string | undefined;
            if (typeof forward === 'string') {
                const parts = forward.split(':');
                address = parts[0];
                port = parseInt(parts[1]);
            } else {
                port = forward;
            }

            const forwardedPort: ForwardedPort = { port, address };
            const attributes = this.getPortAttributes(containerConfig, port);
            if (attributes) {
                forwardedPort.label = attributes.label;
                forwardedPort.protocol = attributes.protocol;
                forwardedPort.onAutoForward = attributes.onAutoForward;
            }
            this.portForwardingProvider.forwardPort(connection.localPort, forwardedPort);
        }

    }

    protected getPortAttributes(containerConfig: DevContainerConfiguration,
        port: number): { label?: string; protocol?: 'http' | 'https'; onAutoForward?: ForwardedPort['onAutoForward'] } | undefined {
        if (!containerConfig.portsAttributes) {
            return undefined;
        }
        const portStr = String(port);
        for (const [pattern, attributes] of Object.entries(containerConfig.portsAttributes)) {
            if (pattern === portStr) {
                return attributes;
            }
            const rangeMatch = pattern.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                if (port >= start && port <= end) {
                    return attributes;
                }
            }
        }
        return undefined;
    }

}

@injectable()
export class MountsContribution implements ContainerCreationContribution {
    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration, api: Docker): Promise<void> {
        if (!containerConfig.mounts) {
            return;
        }

        createOptions.HostConfig!.Mounts!.push(...(containerConfig as NonComposeContainerBase)?.mounts
            ?.map(mount => typeof mount === 'string' ?
                parseWorkspaceMount(mount) :
                { Source: mount.source, Target: mount.target, Type: mount.type ?? 'bind' }) ?? []);
    }

}

@injectable()
export class RemoteUserContribution implements ContainerCreationContribution {
    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration, api: Docker): Promise<void> {
        if (containerConfig.remoteUser) {
            createOptions.User = containerConfig.remoteUser;
        }
    }
}

@injectable()
export class PostCreateCommandContribution implements ContainerCreationContribution {
    async handlePostCreate?(containerConfig: DevContainerConfiguration, container: Docker.Container, api: Docker, outputprovider: ContainerOutputProvider): Promise<void> {
        if (containerConfig.postCreateCommand) {
            const commands = typeof containerConfig.postCreateCommand === 'object' && !(containerConfig.postCreateCommand instanceof Array) ?
                Object.values(containerConfig.postCreateCommand) : [containerConfig.postCreateCommand];
            for (const command of commands) {
                try {
                    let exec;
                    if (command instanceof Array) {
                        exec = await container.exec({ Cmd: command, AttachStderr: true, AttachStdout: true });

                    } else {
                        exec = await container.exec({ Cmd: ['sh', '-c', command], AttachStderr: true, AttachStdout: true });
                    }
                    const stream = await exec.start({ Tty: true });
                    stream.on('data', chunk => outputprovider.onRemoteOutput(chunk.toString()));
                } catch (error) {
                    outputprovider.onRemoteOutput(`Could not execute postCreateCommand ${JSON.stringify(command)}: ${error.message}`);
                }
            }
        }
    }
}

@injectable()
export class ContainerEnvContribution implements ContainerCreationContribution {
    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration): Promise<void> {
        if (containerConfig.containerEnv) {
            if (createOptions.Env === undefined) {
                createOptions.Env = [];
            }
            for (const [key, value] of Object.entries(containerConfig.containerEnv)) {
                createOptions.Env.push(`${key}=${value}`);
            }
        }
    }
}

@injectable()
export class HostConfigSharingContribution implements ContainerCreationContribution {

    protected static readonly ISOLATED_SSH_DIR = path.join(os.homedir(), '.theia', 'dev-container', 'ssh');

    @inject(ILogger)
    protected readonly logger: ILogger;

    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration): Promise<void> {
        const mounts = createOptions.HostConfig?.Mounts ?? [];
        const hasExistingMount = (targetSuffix: string): boolean =>
            mounts.some(m => m.Target?.endsWith(targetSuffix));

        // SSH: bind-mount an isolated SSH directory instead of the real ~/.ssh
        const sshSigningInfo = await this.detectSshSigningKey();
        if (!hasExistingMount('/.ssh')) {
            const isolatedSshDir = await this.ensureIsolatedSshDir(sshSigningInfo);
            if (isolatedSshDir) {
                mounts.push({
                    Source: isolatedSshDir,
                    Target: this.getContainerHomePath(containerConfig, '.ssh'),
                    Type: 'bind',
                    ReadOnly: true
                });
            }
        }

        // Git config: bind-mount to a temp path; will be copied in post-create
        const gitconfigPath = path.join(os.homedir(), '.gitconfig');
        if (await fs.pathExists(gitconfigPath) && !hasExistingMount('/.gitconfig')) {
            mounts.push({
                Source: gitconfigPath,
                Target: '/tmp/host_gitconfig',
                Type: 'bind',
                ReadOnly: true
            });
        }
    }

    async handlePostCreate(containerConfig: DevContainerConfiguration, container: Docker.Container, _api: Docker, outputprovider: ContainerOutputProvider): Promise<void> {
        const user = (containerConfig.remoteUser ?? containerConfig.containerUser ?? 'root') as string;
        const containerHome = this.getContainerHomePath(containerConfig, '');
        const containerSshDir = `${containerHome}.ssh`;

        try {
            // Fix SSH permissions (bind-mount may not preserve them)
            await this.execInContainer(container, 'root',
                `if [ -d "${containerSshDir}" ]; then ` +
                `chmod 700 "${containerSshDir}" 2>/dev/null; ` +
                `find "${containerSshDir}" -name "id_*" ! -name "*.pub" -exec chmod 600 {} \\; 2>/dev/null; ` +
                `find "${containerSshDir}" -name "*.pub" -exec chmod 644 {} \\; 2>/dev/null; ` +
                `chmod 644 "${containerSshDir}/known_hosts" "${containerSshDir}/config" 2>/dev/null; ` +
                // Also fix signing key permissions if present
                `find "${containerSshDir}" -name "git_signing_key*" ! -name "*.pub" -exec chmod 600 {} \\; 2>/dev/null; ` +
                'true; fi'
            );

            // Copy host gitconfig into container user's home so the container user owns it
            const sshSigningInfo = await this.detectSshSigningKey();
            let gitConfigCmd =
                'if [ -f /tmp/host_gitconfig ]; then ' +
                `cp /tmp/host_gitconfig "${containerHome}.gitconfig" && ` +
                `chown ${user}:$(id -gn ${user}) "${containerHome}.gitconfig" 2>/dev/null; ` +
                'fi';

            if (sshSigningInfo?.format === 'ssh' && sshSigningInfo.keyFile) {
                // SSH signing: rewrite the signing key path to point to the container's SSH dir
                const containerKeyPath = `${containerSshDir}/git_signing_key`;
                gitConfigCmd += ` && git config --global user.signingkey "${containerKeyPath}"`;
            } else {
                // GPG signing or no format: disable (GPG keys aren't available in containers)
                gitConfigCmd += ' && git config --global commit.gpgsign false 2>/dev/null' +
                    ' && git config --global tag.gpgsign false 2>/dev/null';
            }
            gitConfigCmd += '; true';

            await this.execInContainer(container, user, gitConfigCmd);

            // Install an SSH agent startup script in /etc/profile.d/ so that
            // login shells (bash -l, started by THEIA_SHELL_ARGS=-l) reuse a
            // single agent. The agent socket lives in /tmp so it works even
            // when ~/.ssh is mounted read-only.
            // The agent starts empty — keys are added automatically on first use
            // via AddKeysToAgent=yes in the SSH config. This avoids passphrase
            // prompts during non-interactive shell initialization.
            const agentScript = [
                '#!/bin/sh',
                'SSH_AGENT_SOCK="/tmp/theia-ssh-agent.sock"',
                'if [ ! -S "$SSH_AGENT_SOCK" ]; then',
                '    eval $(ssh-agent -a "$SSH_AGENT_SOCK") > /dev/null 2>&1',
                'fi',
                'export SSH_AUTH_SOCK="$SSH_AGENT_SOCK"',
            ].join('\n');

            await this.execInContainer(container, 'root',
                `mkdir -p /etc/profile.d && printf '%s\\n' '${agentScript.replace(/'/g, "'\\''")}' > /etc/profile.d/ssh-agent.sh && chmod 644 /etc/profile.d/ssh-agent.sh`
            );
        } catch (error) {
            outputprovider?.onRemoteOutput(`Host config sharing: ${error.message}`);
        }
    }

    protected async detectSshSigningKey(): Promise<{ format: string; keyFile?: string } | undefined> {
        try {
            const format = await this.gitConfigGet('gpg.format');
            if (format !== 'ssh') {
                return format ? { format } : undefined;
            }
            const signingKey = await this.gitConfigGet('user.signingkey');
            return { format: 'ssh', keyFile: signingKey || undefined };
        } catch (error) {
            // Git config not available or command failed
            return undefined;
        }
    }

    protected gitConfigGet(key: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            cp.exec(`git config --global --get ${key}`, (err, stdout) => {
                if (err) {
                    resolve('');
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    protected async ensureIsolatedSshDir(sshSigningInfo?: { format: string; keyFile?: string }): Promise<string | undefined> {
        const isolatedDir = HostConfigSharingContribution.ISOLATED_SSH_DIR;
        try {
            await fs.mkdirs(isolatedDir);

            // Copy known_hosts from real ~/.ssh so host verification works
            const realKnownHosts = path.join(os.homedir(), '.ssh', 'known_hosts');
            const isolatedKnownHosts = path.join(isolatedDir, 'known_hosts');
            if (await fs.pathExists(realKnownHosts) && !await fs.pathExists(isolatedKnownHosts)) {
                await fs.copy(realKnownHosts, isolatedKnownHosts);
            }

            // Copy SSH config and all keys it references via IdentityFile
            const realConfig = path.join(os.homedir(), '.ssh', 'config');
            const isolatedConfig = path.join(isolatedDir, 'config');
            if (await fs.pathExists(realConfig)) {
                // Always refresh the config — rewrite IdentityFile paths so they
                // resolve inside the container (where ~/.ssh is a different user's home)
                const rawConfig = await fs.readFile(realConfig, 'utf-8');
                // Parse IdentityFile entries from the ORIGINAL config and copy referenced keys
                const identityFiles = rawConfig.match(/^\s*IdentityFile\s+(.+)$/gm);
                // Rewrite absolute and ~/ paths to just the filename under ~/.ssh/
                let rewrittenConfig = rawConfig.replace(
                    /^(\s*IdentityFile\s+)(.+)$/gm,
                    (_match, prefix, filePath) => `${prefix}~/.ssh/${path.basename(filePath.trim())}`
                );
                // Prepend AddKeysToAgent so that after the user enters a passphrase
                // once, the key is automatically cached in the running ssh-agent
                if (!/^\s*AddKeysToAgent\s/m.test(rewrittenConfig)) {
                    rewrittenConfig = 'Host *\n    AddKeysToAgent yes\n\n' + rewrittenConfig;
                }
                await fs.writeFile(isolatedConfig, rewrittenConfig);
                if (identityFiles) {
                    for (const line of identityFiles) {
                        const keyRef = line.replace(/^\s*IdentityFile\s+/, '').trim()
                            .replace(/^~\//, os.homedir() + '/');
                        const keyName = path.basename(keyRef);
                        const isolatedKey = path.join(isolatedDir, keyName);
                        if (await fs.pathExists(keyRef) && !await fs.pathExists(isolatedKey)) {
                            await fs.copy(keyRef, isolatedKey);
                            if (await fs.pathExists(keyRef + '.pub')) {
                                await fs.copy(keyRef + '.pub', isolatedKey + '.pub');
                            }
                        }
                    }
                }
            }

            // Generate a dedicated ed25519 keypair if none exists
            const keyPath = path.join(isolatedDir, 'id_ed25519');
            if (!await fs.pathExists(keyPath)) {
                await new Promise<void>((resolve, reject) => {
                    cp.exec(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "theia-dev-container"`, err => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                const pubKey = await fs.readFile(keyPath + '.pub', 'utf-8');
                this.logger.info('Dev Container SSH: generated new keypair. Register this public key with your Git provider:\n' + pubKey.trim());
            }

            // Copy the SSH signing key if git is configured for SSH signing
            if (sshSigningInfo?.format === 'ssh' && sshSigningInfo.keyFile) {
                const signingKeyPath = sshSigningInfo.keyFile.replace(/^~\//, os.homedir() + '/');
                const isolatedSigningKey = path.join(isolatedDir, 'git_signing_key');
                if (await fs.pathExists(signingKeyPath) && !await fs.pathExists(isolatedSigningKey)) {
                    await fs.copy(signingKeyPath, isolatedSigningKey);
                    // Also copy the .pub if it exists
                    if (await fs.pathExists(signingKeyPath + '.pub')) {
                        await fs.copy(signingKeyPath + '.pub', isolatedSigningKey + '.pub');
                    }
                }
            }

            return isolatedDir;
        } catch (error) {
            this.logger.error('Failed to set up isolated SSH directory:', error);
            return undefined;
        }
    }

    protected async execInContainer(container: Docker.Container, user: string, cmd: string): Promise<void> {
        const exec = await container.exec({
            Cmd: ['sh', '-c', cmd],
            User: user,
            AttachStdout: true,
            AttachStderr: true
        });
        await exec.start({});
    }

    protected getContainerHomePath(containerConfig: DevContainerConfiguration, relativePath: string): string {
        const user = containerConfig.remoteUser ?? containerConfig.containerUser;
        if (user && user !== 'root') {
            return `/home/${user}/${relativePath}`;
        }
        return `/root/${relativePath}`;
    }
}

@injectable()
export class DefaultShellContribution implements ContainerCreationContribution {
    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration, api: Docker): Promise<void> {
        // Set shell and terminal env vars at container creation time so they are
        // inherited by ALL processes (including docker exec calls).
        // The remote Theia server is launched via `sh -c` (non-login shell), so
        // env vars must be baked into the container environment.
        if (!createOptions.Env) {
            createOptions.Env = [];
        }
        const setIfMissing = (key: string, value: string): void => {
            if (!createOptions.Env!.some(e => e.startsWith(key + '='))) {
                createOptions.Env!.push(`${key}=${value}`);
            }
        };
        // Prefer bash; fall back to /bin/sh for minimal images (e.g. Alpine) that don't ship bash.
        const shell = createOptions.Image && (await this.isBashAvailable(api, createOptions.Image)) === false
            ? '/bin/sh'
            : '/bin/bash';
        setIfMissing('THEIA_SHELL', shell);
        // Start as login shell so /etc/profile.d/ and ~/.bashrc are sourced,
        // giving the user a proper prompt and SSH agent env vars.
        setIfMissing('THEIA_SHELL_ARGS', '-l');
        setIfMissing('SHELL', shell);
        setIfMissing('TERM', 'xterm-256color');
        setIfMissing('COLORTERM', 'truecolor');
    }

    protected async isBashAvailable(api: Docker, image: string): Promise<boolean | undefined> {
        let probe: Docker.Container | undefined;
        try {
            probe = await api.createContainer({
                Image: image,
                Cmd: ['sh', '-c', 'command -v bash']
            });
            await probe.start();
            const { StatusCode } = await probe.wait();
            return StatusCode === 0;
        } catch {
            return undefined;
        } finally {
            if (probe) {
                try {
                    await probe.remove();
                } catch {
                    // ignore — container may already be gone
                }
            }
        }
    }
}

export namespace OutputHelper {
    export interface Progress {
        id?: string;
        stream: string;
        status?: string;
        progress?: string;
    }

    export function parseProgress(progress: Progress): string {
        return progress.stream ?? progress.progress ?? progress.status ?? '';
    }
}
