// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin
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

/**
 * System file patterns that should be filtered out during file uploads.
 * These patterns cover common system files, temporary files, and development artifacts
 * that are typically not needed in the workspace.
 */
export const SYSTEM_FILE_PATTERNS = [
    // macOS
    '.DS_Store',
    '.AppleDouble',
    '.LSOverride',
    '.Spotlight-V100',
    '.Trashes',
    '.fseventsd',
    '.TemporaryItems',
    '.VolumeIcon.icns',
    '.com.apple.timemachine.donotpresent',
    '.apdisk',
    '.localized',
    '.parentlock',
    '.symlinks',
    '.metadata_never_index',
    '.metadata_never_index_unreadable',

    // Windows
    'desktop.ini',
    'Thumbs.db',
    'ehthumbs.db',
    'ehthumbs_vista.db',
    '*.tmp',
    '*.temp',
    '$RECYCLE.BIN',
    'System Volume Information',
    'pagefile.sys',
    'hiberfil.sys',
    'swapfile.sys',

    // Linux
    '.directory',
    '.Trash-*',
    '.nfs*',

    // Common development files
    '.git',
    '.svn',
    '.hg',
    '.bzr',
    'node_modules',
    '.npm',
    '.yarn',
    '.cache',
    '.tmp',
    '.temp',
    '*.log',
    '*.pid',
    '*.lock',

    // Additional common patterns
    '*.swp',
    '*.swo',
    '*~',
    '.vscode/settings.json',
    '.idea/',
    '*.class',
    '*.pyc',
    '__pycache__/',
    '*.o',
    '*.so',
    '*.dylib',
    '*.dll',
    '*.exe'
] as const;
