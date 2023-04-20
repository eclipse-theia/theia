// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable max-len */

export { ElectronClipboardService, ELECTRON_CLIPBOARD_IPC } from './electron-clipboard';
export { ElectronCurrentWindow, ELECTRON_CURRENT_WINDOW_IPC } from './electron-current-window';
export { ElectronFrontendApplication, ELECTRON_FRONTEND_APPLICATION_IPC } from './electron-frontend-application';
export { ELECTRON_INVOKE_IPC } from './electron-invoke';
export { createIpcChannel, createIpcNamespace, IpcChannel, IpcEvent, IpcHandleConverter, IpcListener, proxy, proxyable, ProxyableOptions, ProxyOptions, TheiaIpcMain, TheiaIpcMainEvent, TheiaIpcMainInvokeEvent, TheiaIpcRenderer, TheiaIpcRendererEvent, TheiaIpcRendererInvokeEvent, TheiaIpcWindow } from './electron-ipc';
export { ElectronKeyboardLayout, ELECTRON_KEYBOARD_LAYOUT_IPC, NativeKeyboardLayout } from './electron-keyboard-layout';
export { MenuDto, MenuRole } from './electron-menu';
export { ConnectionRequest, ConnectionResponse, ELECTRON_MESSAGE_PORT_IPC, MessagePortClient, MessagePortHandler, MessagePortHandlerId, MessagePortServer } from './electron-message-port';
export { bindPreloadApi, ElectronPreloadContribution, isPreloadServiceIdentifier, preloadServiceIdentifier, PRELOAD_SERVICE_PREFIX, TheiaContextBridge, TheiaPreloadApi, TheiaPreloadContext } from './electron-preload';
export { ElectronShell, ELECTRON_SHELL_IPC } from './electron-shell';
export { ElectronSecurityToken, ElectronSecurityTokenService, ELECTRON_SECURITY_TOKEN_IPC } from './electron-token';
export { ElectronWindows, ELECTRON_WINDOWS_IPC } from './electron-windows';
export { AnyFunction, FunctionUtils } from './function-utils';
