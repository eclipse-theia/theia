// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/workbench-cursor-typography.css';
import '../../src/browser/style/qaap-workbench-top-bar.css';
import '../../src/browser/style/qaap-ai-chat-mobile.css';
import '../../src/browser/style/qaap-vsx-registry.css';
import '../../src/browser/style/qaap-menus-narrow-viewport.css';
import '../../src/browser/style/qaap-sidepanel.css';
import '../../src/browser/style/qaap-sidepanel-narrow-viewport.css';
import '../../src/browser/style/qaap-dialog-narrow-viewport.css';
import '../../src/browser/style/qaap-mini-browser-toolbar-mobile.css';
import '../../src/browser/style/qaap-monaco-quick-input-narrow.css';

import { ContainerModule } from '@theia/core/shared/inversify';

export default new ContainerModule(() => { /* CSS side-effect only */ });
