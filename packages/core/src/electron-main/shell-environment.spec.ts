// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { parseShellPath } from './shell-environment';

describe('shell-environment', () => {

    const delimiter = '_THEIA_SHELL_ENV_DELIMITER_';

    it('reads the PATH between the delimiters, ignoring what the dotfiles print around them', () => {
        const output = `Welcome!\nPATH=/not/this\n${delimiter}HOME=/Users/me\nPATH=/opt/bin:/usr/bin\nSHELL=/bin/zsh\n${delimiter}bye`;
        expect(parseShellPath(output)).to.equal('/opt/bin:/usr/bin');
    });

    it('keeps equals signs in the value', () => {
        expect(parseShellPath(`${delimiter}PATH=/a=b:/usr/bin\n${delimiter}`)).to.equal('/a=b:/usr/bin');
    });

    it('does not take a variable whose name ends in PATH', () => {
        expect(parseShellPath(`${delimiter}MANPATH=/usr/share/man\nPATH=/usr/bin\n${delimiter}`)).to.equal('/usr/bin');
    });

    it('strips ANSI escape sequences', () => {
        expect(parseShellPath(`${delimiter}\u001B[0mPATH=/usr/bin\u001B]0;title\u0007\n${delimiter}`)).to.equal('/usr/bin');
    });

    it('returns undefined when the environment has no PATH or the delimiter is missing', () => {
        expect(parseShellPath(`${delimiter}HOME=/Users/me\n${delimiter}`)).to.be.undefined;
        expect(parseShellPath('PATH=/usr/bin\n')).to.be.undefined;
    });
});
