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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { URI, PreferenceService } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { ContextFileValidationService, FileValidationState } from '@theia/ai-chat/lib/browser/context-file-validation-service';
import { ContextFileValidationServiceImpl } from './context-file-validation-service-impl';
import { WorkspaceFunctionScope } from './workspace-functions';

disableJSDOM();

describe('ContextFileValidationService', () => {
    let container: Container;
    let validationService: ContextFileValidationService;
    let mockFileService: FileService;
    let mockWorkspaceService: WorkspaceService;
    let mockPreferenceService: PreferenceService;

    const workspaceRoot = new URI('file:///home/user/workspace');

    // Store URIs as actual URI strings, exactly as URI.toString() would produce them
    const existingFiles = new Map<string, boolean>([
        // Files inside workspace
        ['file:///home/user/workspace/src/index.tsx', true],
        ['file:///home/user/workspace/package.json', true],
        ['file:///home/user/workspace/README.md', true],
        ['file:///home/user/workspace/src/components/Button.tsx', true],
        ['file:///home/user/workspace/config.json', true],
        ['file:///home/user/workspace/src/file%20with%20spaces.tsx', true],
        // Files outside workspace (these exist but should be rejected)
        ['file:///etc/passwd', true],
        ['file:///etc/hosts', true],
        ['file:///home/other-user/secret.txt', true],
        ['file:///tmp/temporary-file.log', true]
    ]);

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(async () => {
        container = new Container();

        // Mock WorkspaceService
        mockWorkspaceService = {
            tryGetRoots: () => [{
                resource: workspaceRoot,
                isDirectory: true
            } as FileStat],
            roots: Promise.resolve([{
                resource: workspaceRoot,
                isDirectory: true
            } as FileStat])
        } as unknown as WorkspaceService;

        // Mock FileService
        mockFileService = {
            exists: async (uri: URI) => {
                const normalizedUri = uri.path.normalize();
                const normalizedUriString = uri.withPath(normalizedUri).toString();
                const uriString = uri.toString();

                const exists = (existingFiles.has(uriString) && existingFiles.get(uriString) === true) ||
                    (existingFiles.has(normalizedUriString) && existingFiles.get(normalizedUriString) === true);
                return exists;
            },
            resolve: async (uri: URI) => {
                const uriString = uri.toString();
                if (existingFiles.has(uriString) && existingFiles.get(uriString) === true) {
                    return {
                        resource: uri,
                        isDirectory: false
                    } as FileStat;
                }
                throw new Error('File not found');
            }
        } as unknown as FileService;

        // Mock PreferenceService
        mockPreferenceService = {
            get: () => false
        } as unknown as PreferenceService;

        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(WorkspaceFunctionScope).toSelf();
        container.bind(ContextFileValidationServiceImpl).toSelf();
        container.bind(ContextFileValidationService).toService(ContextFileValidationServiceImpl);

        validationService = await container.getAsync(ContextFileValidationService);
    });

    describe('validateFile with relative paths', () => {
        it('should validate existing file with relative path', async () => {
            const result = await validationService.validateFile('src/index.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should reject non-existing file with relative path', async () => {
            const result = await validationService.validateFile('src/missing.tsx');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should validate nested file with relative path', async () => {
            const result = await validationService.validateFile('src/components/Button.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should validate file in root with relative path', async () => {
            const result = await validationService.validateFile('package.json');
            expect(result.state).to.equal(FileValidationState.VALID);
        });
    });

    describe('validateFile with absolute file paths', () => {
        it('should validate existing file with absolute path within workspace', async () => {
            const result = await validationService.validateFile('/home/user/workspace/src/index.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should reject non-existing file with absolute path within workspace', async () => {
            const result = await validationService.validateFile('/home/user/workspace/src/missing.tsx');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with absolute path outside workspace (/etc/passwd)', async () => {
            const result = await validationService.validateFile('/etc/passwd');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with absolute path outside workspace (/etc/hosts)', async () => {
            const result = await validationService.validateFile('/etc/hosts');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with absolute path in other user directory', async () => {
            const result = await validationService.validateFile('/home/other-user/secret.txt');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with absolute path in /tmp', async () => {
            const result = await validationService.validateFile('/tmp/temporary-file.log');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject non-existing file with absolute path outside workspace', async () => {
            const result = await validationService.validateFile('/var/log/nonexistent.log');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should validate nested file with absolute path within workspace', async () => {
            const result = await validationService.validateFile('/home/user/workspace/src/components/Button.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });
    });

    describe('validateFile with file:// URIs', () => {
        it('should validate existing file with file:// URI within workspace', async () => {
            const result = await validationService.validateFile('file:///home/user/workspace/src/index.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should reject non-existing file with file:// URI within workspace', async () => {
            const result = await validationService.validateFile('file:///home/user/workspace/src/missing.tsx');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with file:// URI outside workspace (/etc/passwd)', async () => {
            const result = await validationService.validateFile('file:///etc/passwd');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with file:// URI outside workspace (/etc/hosts)', async () => {
            const result = await validationService.validateFile('file:///etc/hosts');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with file:// URI in other user directory', async () => {
            const result = await validationService.validateFile('file:///home/other-user/secret.txt');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with file:// URI in /tmp', async () => {
            const result = await validationService.validateFile('file:///tmp/temporary-file.log');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject non-existing file with file:// URI outside workspace', async () => {
            const result = await validationService.validateFile('file:///var/log/nonexistent.log');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should validate file at workspace root with file:// URI', async () => {
            const result = await validationService.validateFile('file:///home/user/workspace/package.json');
            expect(result.state).to.equal(FileValidationState.VALID);
        });
    });

    describe('validateFile with URI objects', () => {
        it('should validate existing file with URI object within workspace', async () => {
            const uri = new URI('file:///home/user/workspace/src/index.tsx');
            const result = await validationService.validateFile(uri);
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should reject non-existing file with URI object within workspace', async () => {
            const uri = new URI('file:///home/user/workspace/src/missing.tsx');
            const result = await validationService.validateFile(uri);
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject existing file with URI object outside workspace', async () => {
            const uri = new URI('file:///etc/passwd');
            const result = await validationService.validateFile(uri);
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject another existing file with URI object outside workspace', async () => {
            const uri = new URI('file:///home/other-user/secret.txt');
            const result = await validationService.validateFile(uri);
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });
    });

    describe('validateFile with no workspace', () => {
        beforeEach(async () => {
            // Override mock to return no workspace roots
            mockWorkspaceService.tryGetRoots = () => [];
        });

        it('should reject any file when no workspace is open', async () => {
            const result = await validationService.validateFile('src/index.tsx');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject absolute path when no workspace is open', async () => {
            const result = await validationService.validateFile('/home/user/file.txt');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject file:// URI when no workspace is open', async () => {
            const result = await validationService.validateFile('file:///home/user/file.txt');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });
    });

    describe('validateFile with multiple workspace roots', () => {
        const workspaceRoot2 = new URI('file:///home/user/other-project');

        beforeEach(async () => {
            // Override mock to return multiple workspace roots
            mockWorkspaceService.tryGetRoots = () => [
                {
                    resource: workspaceRoot,
                    isDirectory: true
                } as FileStat,
                {
                    resource: workspaceRoot2,
                    isDirectory: true
                } as FileStat
            ];

            // Add files in the second workspace
            existingFiles.set('file:///home/user/other-project/index.js', true);
            existingFiles.set('file:///home/user/other-project/lib/utils.js', true);
        });

        afterEach(() => {
            // Clean up files added for this test
            existingFiles.delete('file:///home/user/other-project/index.js');
            existingFiles.delete('file:///home/user/other-project/lib/utils.js');
        });

        it('should validate file in first workspace root', async () => {
            const result = await validationService.validateFile('src/index.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should validate file in second workspace root with relative path', async () => {
            const result = await validationService.validateFile('index.js');
            expect(result.state).to.equal(FileValidationState.INVALID_SECONDARY);
        });

        it('should validate file in second workspace root with absolute path', async () => {
            const result = await validationService.validateFile('/home/user/other-project/index.js');
            expect(result.state).to.equal(FileValidationState.INVALID_SECONDARY);
        });

        it('should validate file in second workspace root with file:// URI', async () => {
            const result = await validationService.validateFile('file:///home/user/other-project/lib/utils.js');
            expect(result.state).to.equal(FileValidationState.INVALID_SECONDARY);
        });

        it('should still reject files outside both workspace roots', async () => {
            const result = await validationService.validateFile('/etc/passwd');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });
    });

    describe('validateFile error handling', () => {
        it('should return false when FileService.exists throws error', async () => {
            mockFileService.exists = async () => {
                throw new Error('Permission denied');
            };

            const result = await validationService.validateFile('src/index.tsx');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should handle Windows-style paths', async () => {
            // Add a Windows path to existing files
            // Note: URI encoding will convert 'c:' to 'c%3A'
            const windowsRoot = new URI('file:///c:/Users/user/project');
            const windowsFile = new URI('file:///c:/Users/user/project/file.txt');
            existingFiles.set(windowsFile.toString(), true);

            // Override workspace to use Windows path
            mockWorkspaceService.tryGetRoots = () => [{
                resource: windowsRoot,
                isDirectory: true
            } as FileStat];

            const result = await validationService.validateFile('file:///c:/Users/user/project/file.txt');
            expect(result.state).to.equal(FileValidationState.VALID);

            // Clean up
            existingFiles.delete(windowsFile.toString());
        });

        it('should reject Windows system files outside workspace', async () => {
            // Add Windows system file
            const windowsSystemFile = 'file:///c:/Windows/System32/config/sam';
            existingFiles.set(windowsSystemFile, true);

            // Keep workspace as Linux for this test
            const result = await validationService.validateFile('file:///c:/Windows/System32/config/sam');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);

            // Clean up
            existingFiles.delete(windowsSystemFile);
        });
    });

    describe('edge cases', () => {
        it('should handle paths with special characters', async () => {
            const result = await validationService.validateFile('file:///home/user/workspace/src/file%20with%20spaces.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should handle paths with normalized separators', async () => {
            const result = await validationService.validateFile('src\\components\\Button.tsx');
            expect(result.state).to.equal(FileValidationState.VALID);
        });

        it('should reject empty path', async () => {
            const result = await validationService.validateFile('');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject parent directory references in relative paths', async () => {
            // Parent directory references are not allowed for security and clarity
            const result = await validationService.validateFile('src/../config.json');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject path traversal attempts with parent directory references', async () => {
            // Path traversal attempts should be rejected
            const result = await validationService.validateFile('../../../../../../etc/passwd');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });

        it('should reject absolute paths with parent directory references', async () => {
            // Even absolute paths with .. should be rejected for consistency
            const result = await validationService.validateFile('/home/user/workspace/src/../config.json');
            expect(result.state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        });
    });
});
