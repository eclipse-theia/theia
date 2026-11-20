// *****************************************************************************
// Copyright (C) 2026 Javier MV and others.
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
import { injectable } from '@theia/core/shared/inversify';
import { ContainerCreationContribution } from '../docker-container-service.js';
import { DevContainerConfiguration } from '../devcontainer-file.js';
import { ContainerOutputProvider } from '../../electron-common/container-output-provider.js';

/**
 * One entry of the `devcontainer.metadata` image label.
 * See https://containers.dev/implementors/spec/#image-metadata
 */
export interface ImageMetadataEntry {
    remoteUser?: string;
    containerUser?: string;
    [key: string]: unknown;
}

export namespace ImageMetadataEntry {

    /**
     * Name of the image label that holds the dev container metadata.
     */
    export const LABEL = 'devcontainer.metadata';

    /**
     * Properties merged from the image metadata. For each of them, the last entry that defines it wins.
     */
    export const LAST_WINS_PROPERTIES = ['remoteUser', 'containerUser'] as const;
}

/**
 * Reads the `devcontainer.metadata` label of the image the container is created from
 * and merges it into the dev container configuration, so that the following contributions
 * see the merged values (e.g. `remoteUser` defined by the image).
 */
@injectable()
export class ImageMetadataContribution implements ContainerCreationContribution {

    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration,
        api: Docker, outputProvider?: ContainerOutputProvider): Promise<void> {
        if (!createOptions.Image) {
            return;
        }
        const metadata = await this.getImageMetadata(api, createOptions.Image, outputProvider);
        const fromImage = this.mergeMetadata(containerConfig, metadata);
        for (const [property, value] of Object.entries(fromImage)) {
            outputProvider?.onRemoteOutput(`Using ${property} "${value}" from image metadata`);
        }
    }

    protected async getImageMetadata(api: Docker, image: string, outputProvider?: ContainerOutputProvider): Promise<ImageMetadataEntry[]> {
        const info = await api.getImage(image).inspect();
        const label = info.Config?.Labels?.[ImageMetadataEntry.LABEL];
        if (!label) {
            return [];
        }
        try {
            return this.parseMetadata(label);
        } catch (error) {
            outputProvider?.onRemoteOutput(`Could not parse the ${ImageMetadataEntry.LABEL} label of image "${image}": ${error.message}`);
            return [];
        }
    }

    /**
     * Parses the value of the {@link ImageMetadataEntry.LABEL} label: a JSON array of entries, or a single entry.
     * Throws if the value is not valid JSON.
     */
    protected parseMetadata(label: string): ImageMetadataEntry[] {
        const value: unknown = JSON.parse(label);
        const entries = Array.isArray(value) ? value : [value];
        return entries.filter((entry): entry is ImageMetadataEntry => !!entry && typeof entry === 'object' && !Array.isArray(entry));
    }

    /**
     * Merges the image metadata into the dev container configuration, as the reference implementation does:
     * the configuration is treated as the last entry, so its values take precedence over the image's.
     * Returns the properties that were taken from the image metadata.
     */
    protected mergeMetadata(config: DevContainerConfiguration, metadata: ImageMetadataEntry[]): Partial<ImageMetadataEntry> {
        const entries: ImageMetadataEntry[] = [...metadata, config];
        const fromImage: Partial<ImageMetadataEntry> = {};
        for (const property of ImageMetadataEntry.LAST_WINS_PROPERTIES) {
            const value = entries.reduce<string | undefined>((last, entry) => typeof entry[property] === 'string' ? entry[property] : last, undefined);
            if (value !== undefined && config[property] === undefined) {
                config[property] = value;
                fromImage[property] = value;
            }
        }
        return fromImage;
    }
}
