// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ResourcePropertyDataService } from './resource-property-data-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import URI from '@theia/core/lib/common/uri';
import { PropertyDataService } from '../property-data-service';
import { FileSelection } from '@theia/filesystem/lib/browser/file-selection';
import { Navigatable } from '@theia/core/lib/browser/navigatable';
import { FileStat } from '@theia/filesystem/lib/common/files';

disableJSDOM();

let resourcePropertyDataService: ResourcePropertyDataService;

const mockFileStat: FileStat = {
    isFile: false,
    isDirectory: true,
    isSymbolicLink: false,
    isReadonly: false,
    resource: new URI('resource'),
    name: 'name'
};

describe('resource-property-data-service', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        const container = new Container();
        container.bind(ResourcePropertyDataService).toSelf().inSingletonScope();
        container.bind(FileService).toConstantValue({
            async resolve(uri: URI): Promise<FileStat> {
                return mockFileStat;
            }
        } as FileService);
        container.bind(PropertyDataService).to(ResourcePropertyDataService).inSingletonScope();
        resourcePropertyDataService = container.get(ResourcePropertyDataService);
    });

    after(() => {
        disableJSDOM();
    });

    const navigatableSelection: Navigatable = {
        getResourceUri(): URI | undefined {
            return new URI('resource-uri');
        },
        createMoveToUri(): URI | undefined {
            return new URI('move-uri');
        }
    };

    const fileSelection: FileSelection[] = [
        { fileStat: mockFileStat }
    ];

    describe('#canHandle', () => {

        it('should not handle an empty object selection', () => {
            expect(resourcePropertyDataService.canHandleSelection({})).eq(0);
        });

        it('should not handle an undefined selection', () => {
            expect(resourcePropertyDataService.canHandleSelection(undefined)).eq(0);
        });

        it('should handle a file selection', () => {
            expect(resourcePropertyDataService.canHandleSelection(fileSelection)).to.be.greaterThan(0);
        });

        it('should handle a navigatable selection', () => {
            expect(resourcePropertyDataService.canHandleSelection(navigatableSelection)).to.be.greaterThan(0);
        });
    });

    describe('#providePropertyData', () => {

        it('should return the file-stat of a file selection', async () => {
            const data = await resourcePropertyDataService.providePropertyData(fileSelection);
            expect(data).to.equal(mockFileStat);
        });

        it('should return the first file-stat for multiple file selections', async () => {
            const arrayFileSelection: FileSelection[] = [
                { fileStat: mockFileStat },
                { fileStat: { ...mockFileStat, resource: new URI('secondURI') } }
            ];
            const data = await resourcePropertyDataService.providePropertyData(arrayFileSelection);
            expect(data).to.equal(arrayFileSelection[0].fileStat);
        });

        it('should return the file-stat for a navigatable selection', async () => {
            const data = await resourcePropertyDataService.providePropertyData(navigatableSelection);
            expect(data).to.equal(mockFileStat);
        });

        it('should return undefined if the selection is undefined', async () => {
            const data = await resourcePropertyDataService.providePropertyData(undefined);
            expect(data).to.equal(undefined);
        });

    });

});

