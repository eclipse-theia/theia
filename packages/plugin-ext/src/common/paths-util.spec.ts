// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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
import { relative } from './paths-util';

describe('paths-util', () => {

    describe('relative', () => {
        it('should resolve a child against its parent', () => {
            expect(relative('/tmp/project', '/tmp/project/Project.toml')).to.equal('Project.toml');
        });

        it('should resolve a nested child against its parent', () => {
            expect(relative('/tmp/project', '/tmp/project/generated/definitions.jl')).to.equal('generated/definitions.jl');
        });

        it('should resolve a child given Windows separators', () => {
            expect(relative('c:\\tmp\\project', 'c:\\tmp\\project\\Project.toml')).to.equal('Project.toml');
        });

        it('should resolve a nested child given Windows separators', () => {
            expect(relative('c:\\tmp\\project', 'c:\\tmp\\project\\generated\\definitions.jl')).to.equal('generated/definitions.jl');
        });

        it('should resolve a sibling given Windows separators', () => {
            expect(relative('c:\\tmp\\project', 'c:\\tmp\\other\\Project.toml')).to.equal('../other/Project.toml');
        });

        it('should return an empty string for identical paths', () => {
            expect(relative('c:\\tmp\\project', 'c:\\tmp\\project')).to.equal('');
        });
    });
});
