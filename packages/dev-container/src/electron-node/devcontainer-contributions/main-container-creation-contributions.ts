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
import { Path } from '@theia/core';
import { ContainerOutputProvider } from '../../electron-common/container-output-provider';
import * as fs from '@theia/core/shared/fs-extra';
import { RemotePortForwardingProvider } from '@theia/remote/lib/electron-common/remote-port-forwarding-provider';
import { RemoteDockerContainerConnection } from '../remote-container-connection-provider';

export function registerContainerCreationContributions(bind: interfaces.Bind): void {
    bind(ContainerCreationContribution).to(ImageFileContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(DockerFileContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(ForwardPortsContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(MountsContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(RemoteUserContribution).inSingletonScope();
    bind(ContainerCreationContribution).to(PostCreateCommandContribution).inSingletonScope();
}

@injectable()
export class ImageFileContribution implements ContainerCreationContribution {
    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: ImageContainer,
        api: Docker, outputprovider: ContainerOutputProvider): Promise<void> {
        if (containerConfig.image) {
            await new Promise<void>((res, rej) => api.pull(containerConfig.image, {}, (err, stream) => {
                if (err) {
                    rej(err);
                } else {
                    api.modem.followProgress(stream, (error, output) => error ?
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
                outputprovider.onRemoteOutput(`could not build dockerfile "${dockerfile}" reason: ${error.message}`);
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

            this.portForwardingProvider.forwardPort(connection.localPort, { port, address });
        }

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
                this.parseMountString(mount) :
                { Source: mount.source, Target: mount.target, Type: mount.type ?? 'bind' }) ?? []);
    }

    parseMountString(mount: string): Docker.MountSettings {
        const parts = mount.split(',');
        return {
            Source: parts.find(part => part.startsWith('source=') || part.startsWith('src='))?.split('=')[1]!,
            Target: parts.find(part => part.startsWith('target=') || part.startsWith('dst='))?.split('=')[1]!,
            Type: (parts.find(part => part.startsWith('type='))?.split('=')[1] ?? 'bind') as Docker.MountType
        };
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
                    outputprovider.onRemoteOutput('could not execute postCreateCommand ' + JSON.stringify(command) + ' reason:' + error.message);
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
