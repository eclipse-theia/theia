// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { WorkspaceTrustService } from './workspace-trust-service';

class TestableWorkspaceTrustService extends WorkspaceTrustService {
    public testNormalizeUri(uriStr: string): string {
        return this.normalizeUri(uriStr);
    }
}

describe('WorkspaceTrustService', () => {
    let service: TestableWorkspaceTrustService;

    beforeEach(() => {
        service = new TestableWorkspaceTrustService();
    });

    describe('normalizeUri', () => {
        it('should strip trailing slashes', () => {
            const result = service.testNormalizeUri('file:///home/user/project/');
            expect(result).to.equal('file:///home/user/project');
        });

        it('should not modify URIs without trailing slashes', () => {
            const result = service.testNormalizeUri('file:///home/user/project');
            expect(result).to.equal('file:///home/user/project');
        });

        it('should normalize Windows URIs to lowercase', () => {
            const result = service.testNormalizeUri('file:///C:/Users/Project');
            // URI class encodes the colon as %3A
            expect(result).to.equal('file:///c%3a/users/project');
        });

        it('should handle Windows URIs with trailing slashes', () => {
            const result = service.testNormalizeUri('file:///C:/Users/Project/');
            expect(result).to.equal('file:///c%3a/users/project');
        });

        it('should not lowercase non-Windows file URIs', () => {
            const result = service.testNormalizeUri('file:///home/User/Project');
            expect(result).to.equal('file:///home/User/Project');
        });

        it('should compare URIs consistently regardless of trailing slash', () => {
            const withSlash = service.testNormalizeUri('file:///home/user/project/');
            const withoutSlash = service.testNormalizeUri('file:///home/user/project');
            expect(withSlash).to.equal(withoutSlash);
        });

        it('should compare Windows URIs case-insensitively', () => {
            const uppercase = service.testNormalizeUri('file:///C:/Users/PROJECT');
            const lowercase = service.testNormalizeUri('file:///c:/users/project');
            expect(uppercase).to.equal(lowercase);
        });
    });
});
