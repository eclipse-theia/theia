/********************************************************************************
 * Copyright (C) 2020 Maksim Ryzhikov and others.
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
import * as temp from 'temp';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ApplicationPackage } from './application-package';
import { ApplicationProps } from './application-props';
import * as sinon from 'sinon';

const track = temp.track();
const sandbox = sinon.createSandbox();

describe('application-package', function (): void {
    after((): void => {
        sandbox.restore();
        track.cleanupSync();
    });

    it('should print warning if user set unknown target in package.json and use browser as a default value', function (): void {
        const warn = sandbox.stub(console, 'warn');
        const root = createProjectWithTarget('foo');
        const applicationPackage = new ApplicationPackage({ projectPath: root });
        assert.strictEqual(applicationPackage.target, ApplicationProps.ApplicationTarget.browser);
        assert.strictEqual(warn.called, true);
    });

    it('should set target from package.json', function (): void {
        const target = 'electron';
        const root = createProjectWithTarget(target);
        const applicationPackage = new ApplicationPackage({ projectPath: root });
        assert.strictEqual(applicationPackage.target, target);
    });

    it('should prefer target from passed options over target from package.json', function (): void {
        const pckTarget = 'electron';
        const optTarget = 'browser';
        const root = createProjectWithTarget(pckTarget);
        const applicationPackage = new ApplicationPackage({ projectPath: root, appTarget: optTarget });
        assert.strictEqual(applicationPackage.target, optTarget);
    });

    function createProjectWithTarget(target: string): string {
        const root = track.mkdirSync('foo-project');
        fs.writeFileSync(path.join(root, 'package.json'), `{"theia": {"target": "${target}"}}`);
        return root;
    }
});
