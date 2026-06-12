"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
var inversify_1 = require("@theia/core/shared/inversify");
var shell_execution_server_impl_1 = require("@theia/ai-terminal/lib/node/shell-execution-server-impl");
var qaap_shell_execution_server_impl_1 = require("./qaap-shell-execution-server-impl");
exports.default = new inversify_1.ContainerModule(function (bind, unbind, isBound, rebind) {
    rebind(shell_execution_server_impl_1.ShellExecutionServerImpl).to(qaap_shell_execution_server_impl_1.QaapShellExecutionServerImpl).inSingletonScope();
});
