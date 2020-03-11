/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/* eslint-disable no-unused-expressions */

import * as fs from 'fs';
import * as path from 'path';
import rimraf = require('rimraf');
import { expect } from 'chai';
import { PluginDeployerFileHandlerContextImpl } from './plugin-deployer-file-handler-context-impl';

const testDataPath = path.join(__dirname, '../../../src/main/node/test-data');
const zipSlipArchivePath = path.join(testDataPath, 'slip.tar.gz');
const slippedFilePath = '/tmp/slipped.txt';

describe('PluginDeployerFileHandlerContextImpl', () => {

    /**
     * Clean resources after a test.
     */
    const finalizers: Array<() => void> = [];

    beforeEach(() => {
        finalizers.length = 0;
    });

    afterEach(() => {
        for (const finalize of finalizers) {
            try {
                finalize();
            } catch (error) {
                console.error(error);
            }
        }
    });

    it('zip-slip should happen if we do not prevent it', async function (): Promise<void> {
        if (process.platform === 'win32') {
            this.skip(); // Test will not work on Windows (because of the /tmp path)
        }

        const dest = fs.mkdtempSync('/tmp/plugin-ext-test');
        finalizers.push(() => rimraf.sync(slippedFilePath));
        finalizers.push(() => rimraf.sync(dest));
        rimraf.sync(slippedFilePath);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pluginDeployerFileHandlerContext = new PluginDeployerFileHandlerContextImpl(undefined as any);
        pluginDeployerFileHandlerContext['_safeUnzip'] = false;
        const success: boolean = await pluginDeployerFileHandlerContext.unzip(zipSlipArchivePath, dest).then(() => true, () => false);

        expect(success).true;
        expect(fs.existsSync(slippedFilePath)).true;
    });

    it('should prevent zip-slip by default', async function (): Promise<void> {
        if (process.platform === 'win32') {
            this.skip(); // Test will not work on Windows (because of the /tmp path)
        }

        const dest = fs.mkdtempSync('/tmp/plugin-ext-test');
        finalizers.push(() => rimraf.sync(slippedFilePath));
        finalizers.push(() => rimraf.sync(dest));
        rimraf.sync(slippedFilePath);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pluginDeployerFileHandlerContext = new PluginDeployerFileHandlerContextImpl(undefined as any);
        const success: boolean = await pluginDeployerFileHandlerContext.unzip(zipSlipArchivePath, dest).then(() => true, () => false);

        expect(success).false;
        expect(fs.existsSync(slippedFilePath)).false;
    });

});
