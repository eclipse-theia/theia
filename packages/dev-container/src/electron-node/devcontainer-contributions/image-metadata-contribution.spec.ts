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

import { expect } from 'chai';
import * as Docker from 'dockerode';
import { ImageMetadataContribution, ImageMetadataEntry } from './image-metadata-contribution.js';
import { DevContainerConfiguration } from '../devcontainer-file.js';
import { ContainerOutputProvider } from '../../electron-common/container-output-provider.js';

const LABEL = '[{"id":"some-feature"},{"remoteUser":"image-user"}]';

describe('ImageMetadataContribution', () => {

    function createApi(labels?: Record<string, string>): Docker {
        return {
            getImage: () => ({ inspect: async () => ({ Config: { Labels: labels } }) })
        } as unknown as Docker;
    }

    function createOutput(): ContainerOutputProvider & { lines: string[] } {
        const lines: string[] = [];
        return { lines, onRemoteOutput: (line: string) => lines.push(line) } as ContainerOutputProvider & { lines: string[] };
    }

    /**
     * Runs the contribution for an image with the given `devcontainer.metadata` label and returns its output.
     */
    async function handle(config: DevContainerConfiguration, label: string): Promise<string[]> {
        const output = createOutput();
        await new ImageMetadataContribution().handleContainerCreation({ Image: 'test' }, config,
            createApi({ [ImageMetadataEntry.LABEL]: label }), output);
        return output.lines;
    }

    describe('label', () => {

        it('should read an array of entries', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            const lines = await handle(config, LABEL);
            expect(config.remoteUser).to.equal('image-user');
            expect(lines).to.deep.equal(['Using remoteUser "image-user" from image metadata']);
        });

        it('should accept a single entry', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            await handle(config, '{"remoteUser":"image-user"}');
            expect(config.remoteUser).to.equal('image-user');
        });

        it('should accept an empty array', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            const lines = await handle(config, '[]');
            expect(config).to.deep.equal({ image: 'test' });
            expect(lines).to.deep.equal([]);
        });

        it('should skip entries that are not objects', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            await handle(config, '[1, "a", null, [], {"remoteUser":"image-user"}]');
            expect(config.remoteUser).to.equal('image-user');

            const other: DevContainerConfiguration = { image: 'test' };
            await handle(other, '42');
            expect(other).to.deep.equal({ image: 'test' });
        });

        it('should keep the last value of a duplicated key, as JSON.parse does', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            await handle(config, '{"remoteUser":"first","remoteUser":"second"}');
            expect(config.remoteUser).to.equal('second');
        });

        it('should report an invalid label and continue', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            const lines = await handle(config, '[{');
            expect(config).to.deep.equal({ image: 'test' });
            expect(lines).to.have.lengthOf(1);
            expect(lines[0]).to.match(/^Could not parse the devcontainer.metadata label of image "test"/);
        });

        it('should do nothing for an empty label', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            const lines = await handle(config, '');
            expect(config).to.deep.equal({ image: 'test' });
            expect(lines).to.deep.equal([]);
        });
    });

    describe('merge', () => {

        it('should keep the values of the configuration', async () => {
            const config: DevContainerConfiguration = { image: 'test', remoteUser: 'config-user', containerUser: 'config-user' };
            const lines = await handle(config, '[{"remoteUser":"image-user","containerUser":"image-user"}]');
            expect(config.remoteUser).to.equal('config-user');
            expect(config.containerUser).to.equal('config-user');
            expect(lines).to.deep.equal([]);
        });

        it('should use the last entry that defines a property', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            await handle(config, '[{"remoteUser":"first","containerUser":"image-user"},{"remoteUser":"second"},{}]');
            expect(config.remoteUser).to.equal('second');
            expect(config.containerUser).to.equal('image-user');
        });

        it('should ignore values that are not strings', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            await handle(config, '[{"remoteUser":"image-user"},{"remoteUser":42}]');
            expect(config.remoteUser).to.equal('image-user');
        });
    });

    describe('image', () => {

        it('should do nothing for an image without the label', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            await new ImageMetadataContribution().handleContainerCreation({ Image: 'test' }, config, createApi());
            expect(config).to.deep.equal({ image: 'test' });
        });

        it('should do nothing without an image', async () => {
            const config: DevContainerConfiguration = { image: 'test' };
            const api = { getImage: () => { throw new Error('should not be called'); } } as unknown as Docker;
            await new ImageMetadataContribution().handleContainerCreation({}, config, api);
            expect(config).to.deep.equal({ image: 'test' });
        });
    });
});
