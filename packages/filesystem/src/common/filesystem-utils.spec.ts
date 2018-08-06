/********************************************************************************
  * Copyright (C) 2018 Ericsson and others.
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

import { expect } from 'chai';
import { FileSystemUtils } from './filesystem-utils';

describe('filesystem-utils', () => {
    const linuxHome = '/home/test-user';
    const windowsHome = '/C:/Users/test-user';

    describe('Linux', () => {
        it('should shorten path on Linux, path starting with home', async () => {
            const path = `${linuxHome}/a/b/theia`;
            const expected = '~/a/b/theia';
            expect(FileSystemUtils.tildifyPath(path, linuxHome)).eq(expected);
        });

        it('should shorten path on Linux, path starting with home with duplication', async () => {
            const path = `${linuxHome}/${linuxHome}/a/b/theia`;
            const expected = `~/${linuxHome}/a/b/theia`;
            expect(FileSystemUtils.tildifyPath(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux, path not starting with home', async () => {
            const path = `/test/${linuxHome}/a/b/theia`;
            const expected = `/test/${linuxHome}/a/b/theia`;
            expect(FileSystemUtils.tildifyPath(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux, path not starting with correct home', async () => {
            const path = `/test/${linuxHome}123/a/b/theia`;
            const expected = `/test/${linuxHome}123/a/b/theia`;
            expect(FileSystemUtils.tildifyPath(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux when home is empty', async () => {
            const path = `${linuxHome}/a/b/theia`;
            const expected = `${linuxHome}/a/b/theia`;
            expect(FileSystemUtils.tildifyPath(path, '')).eq(expected);
        });
    });

    describe('Windows', () => {
        it('should not shorten path on Windows', async () => {
            const path = `${windowsHome}/a/b/theia`;
            const expected = `${windowsHome}/a/b/theia`;
            expect(FileSystemUtils.tildifyPath(path, windowsHome)).eq(expected);
        });

        it('should not shorten path on Windows when home is empty', async () => {
            const path = `${windowsHome}/a/b/theia`;
            const expected = `${windowsHome}/a/b/theia`;
            expect(FileSystemUtils.tildifyPath(path, '')).eq(expected);
        });
    });

});
