/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import * as assert from 'assert';
import { KnownCommands } from './known-commands';
import { URI } from '@theia/core/shared/vscode-uri';
import { Position } from './types-impl';
import { fromPosition } from './type-converters';

describe('Known Command Conversions', () => {

    it('Should convert position correctly', () => {

        // given
        const commandID = 'editor.action.rename';
        const uri = URI.parse('file://my_theia_location');
        const line = 61;
        const character = 22;
        const position = new Position(line, character); // vscode type position

        assert.ok(KnownCommands.mapped(commandID));

        // when
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        KnownCommands.map(commandID, [uri, position], (mappedID: string, mappedArgs: any[]) => {

            // then
            assert.strictEqual(commandID, mappedID);
            assert.strictEqual(mappedArgs.length, 2);
            assert.deepStrictEqual(uri, mappedArgs[0]);

            const expectedMonacoPosition = fromPosition(position);
            assert.deepStrictEqual(expectedMonacoPosition, mappedArgs[1]);
        });

    });

});
