// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import * as decompress from 'decompress';
import * as path from 'path';
import * as filenamify from 'filenamify';
import { FileUri } from '@theia/core/lib/node';
import * as fs from '@theia/core/shared/fs-extra';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { PluginIdentifiers, PluginPackage } from '@theia/plugin-ext/lib/common/plugin-protocol';

/**
 * Represents the identity of an extension extracted from its package.json.
 */
export interface ExtensionIdentity {
    /** The publisher of the extension (may be undefined for unpublished extensions) */
    publisher?: string;
    /** The name of the extension */
    name: string;
    /** The version of the extension */
    version: string;
    /** The unversioned ID in the format `publisher.name` */
    unversionedId: PluginIdentifiers.UnversionedId;
    /** The versioned ID in the format `publisher.name@version` */
    versionedId: PluginIdentifiers.VersionedId;
}

/**
 * Extracts extension identity from a VSIX file by reading its package.json.
 *
 * VSIX files are ZIP archives with the extension content in an `extension/` subdirectory.
 * This function extracts only the `extension/package.json` file to read the extension metadata.
 *
 * @param vsixPath Path to the VSIX file
 * @returns The extension identity, or undefined if the package.json cannot be read or is invalid
 */
export async function extractExtensionIdentityFromVsix(vsixPath: string): Promise<ExtensionIdentity | undefined> {
    try {
        // Extract only the package.json file from the VSIX
        const files = await decompress(vsixPath, {
            filter: file => file.path === 'extension/package.json'
        });

        if (files.length === 0) {
            console.warn(`[${vsixPath}]: No extension/package.json found in VSIX`);
            return undefined;
        }

        const packageJsonContent = files[0].data.toString('utf8');
        const packageJson: Partial<PluginPackage> = JSON.parse(packageJsonContent);

        // Validate required fields
        if (!packageJson.name || !packageJson.version) {
            console.warn(`[${vsixPath}]: Invalid package.json - missing name or version`);
            return undefined;
        }

        // Use UNPUBLISHED as the default publisher for extensions without one
        const publisher = packageJson.publisher ?? PluginIdentifiers.UNPUBLISHED;

        const components: PluginIdentifiers.Components = {
            publisher,
            name: packageJson.name,
            version: packageJson.version
        };

        return {
            publisher: packageJson.publisher,
            name: packageJson.name,
            version: packageJson.version,
            unversionedId: PluginIdentifiers.componentsToUnversionedId(components),
            versionedId: PluginIdentifiers.componentsToVersionedId(components)
        };
    } catch (error) {
        console.error(`[${vsixPath}]: Failed to extract extension identity from VSIX`, error);
        return undefined;
    }
}

export async function decompressExtension(sourcePath: string, destPath: string): Promise<boolean> {
    try {
        await decompress(sourcePath, destPath);
        if (sourcePath.endsWith('.tgz')) {
            // unzip node_modules from built-in extensions, see https://github.com/eclipse-theia/theia/issues/5756
            const extensionPath = path.join(destPath, 'package');
            const vscodeNodeModulesPath = path.join(extensionPath, 'vscode_node_modules.zip');
            if (await fs.pathExists(vscodeNodeModulesPath)) {
                await decompress(vscodeNodeModulesPath, path.join(extensionPath, 'node_modules'));
            }
        }
        return true;
    } catch (error) {
        console.error(`Failed to decompress ${sourcePath} to ${destPath}: ${error}`);
        throw error;
    }
}

export async function existsInDeploymentDir(env: PluginVSCodeEnvironment, extensionId: string): Promise<boolean> {
    return fs.pathExists(await getExtensionDeploymentDir(env, extensionId));
}

export const TMP_DIR_PREFIX = 'tmp-vscode-unpacked-';
export async function unpackToDeploymentDir(env: PluginVSCodeEnvironment, sourcePath: string, extensionId: string): Promise<string> {
    const extensionDeploymentDir = await getExtensionDeploymentDir(env, extensionId);
    if (await fs.pathExists(extensionDeploymentDir)) {
        console.log(`[${extensionId}]: deployment dir "${extensionDeploymentDir}" already exists`);
        return extensionDeploymentDir;
    }

    const tempDir = await getTempDir(env, TMP_DIR_PREFIX);
    try {
        console.log(`[${extensionId}]: trying to decompress "${sourcePath}" into "${tempDir}"...`);
        if (!await decompressExtension(sourcePath, tempDir)) {
            await fs.remove(tempDir);
            const msg = `[${extensionId}]: decompressing "${sourcePath}" to "${tempDir}" failed`;
            console.error(msg);
            throw new Error(msg);
        }
    } catch (e) {
        await fs.remove(tempDir);
        const msg = `[${extensionId}]: error while decompressing "${sourcePath}" to "${tempDir}"`;
        console.error(msg, e);
        throw e;
    }
    console.log(`[${extensionId}]: decompressed to temp dir "${tempDir}"`);

    try {
        console.log(`[${extensionId}]: renaming to extension dir "${extensionDeploymentDir}"...`);
        await fs.rename(tempDir, extensionDeploymentDir);
        return extensionDeploymentDir;
    } catch (e) {
        await fs.remove(tempDir);
        console.error(`[${extensionId}]: error while renaming "${tempDir}" to "${extensionDeploymentDir}"`, e);
        throw e;
    }
}

export async function getExtensionDeploymentDir(env: PluginVSCodeEnvironment, extensionId: string): Promise<string> {
    const deployedPluginsDirUri = await env.getDeploymentDirUri();
    const normalizedExtensionId = filenamify(extensionId, { replacement: '_' });
    const extensionDeploymentDirPath = FileUri.fsPath(deployedPluginsDirUri.resolve(normalizedExtensionId));
    return extensionDeploymentDirPath;
}

export async function getTempDir(env: PluginVSCodeEnvironment, prefix: string): Promise<string> {
    const deploymentDirPath = FileUri.fsPath(await env.getDeploymentDirUri());
    try {
        if (!await fs.pathExists(deploymentDirPath)) {
            console.log(`Creating deployment dir ${deploymentDirPath}`);
            await fs.mkdirs(deploymentDirPath);
        }
        return await fs.mkdtemp(path.join(deploymentDirPath, prefix));
    } catch (error) {
        console.error(`Failed to create deployment dir ${deploymentDirPath}: ${error}`);
        throw error;
    }
}
