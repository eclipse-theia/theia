"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
var chai_1 = require("chai");
var common_1 = require("@theia/ai-core/lib/common");
var chat_agents_1 = require("@theia/ai-chat/lib/common/chat-agents");
var chat_model_1 = require("@theia/ai-chat/lib/common/chat-model");
var parse_contents_1 = require("@theia/ai-chat/lib/common/parse-contents");
var qaap_incremental_stream_parse_1 = require("./qaap-incremental-stream-parse");
describe('qaap-incremental-stream-parse', function () {
    afterEach(function () {
        (0, qaap_incremental_stream_parse_1.resetIncrementalStreamPatchForTests)();
    });
    it('streamBufferNeedsStructuredParse detects fenced code openers', function () {
        (0, chai_1.expect)((0, qaap_incremental_stream_parse_1.streamBufferNeedsStructuredParse)('plain prose only')).to.equal(false);
        (0, chai_1.expect)((0, qaap_incremental_stream_parse_1.streamBufferNeedsStructuredParse)('intro\n```typescript\nconst x = 1')).to.equal(true);
        (0, chai_1.expect)((0, qaap_incremental_stream_parse_1.streamBufferNeedsStructuredParse)('tilde fence\n~~~\n')).to.equal(true);
    });
    it('patchAbstractStreamParsingChatAgentForIncrementalParse is idempotent', function () {
        (0, qaap_incremental_stream_parse_1.resetIncrementalStreamPatchForTests)();
        (0, qaap_incremental_stream_parse_1.patchAbstractStreamParsingChatAgentForIncrementalParse)();
        var patched = chat_agents_1.AbstractStreamParsingChatAgent.prototype.addStreamResponse;
        (0, qaap_incremental_stream_parse_1.patchAbstractStreamParsingChatAgentForIncrementalParse)();
        (0, chai_1.expect)(chat_agents_1.AbstractStreamParsingChatAgent.prototype.addStreamResponse).to.equal(patched);
    });
    it('consumeIncrementalLanguageModelStream appends plain markdown without per-token parseContents', function () { return __awaiter(void 0, void 0, void 0, function () {
        var parseCalls, agent, responseBody, request, stream, languageModelResponse;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parseCalls = 0;
                    agent = {
                        parseContents: function (text, request) {
                            parseCalls++;
                            return (0, parse_contents_1.parseContents)(text, request);
                        },
                        parse: function (token) { return new chat_model_1.MarkdownChatResponseContentImpl((0, common_1.isTextResponsePart)(token) ? token.content : ''); },
                    };
                    responseBody = createMutableResponseBody();
                    request = { response: { response: responseBody } };
                    stream = function () {
                        return __asyncGenerator(this, arguments, function () {
                            var i;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        i = 0;
                                        _a.label = 1;
                                    case 1:
                                        if (!(i < 120)) return [3 /*break*/, 5];
                                        return [4 /*yield*/, __await({ content: " token-".concat(i) })];
                                    case 2: return [4 /*yield*/, _a.sent()];
                                    case 3:
                                        _a.sent();
                                        _a.label = 4;
                                    case 4:
                                        i++;
                                        return [3 /*break*/, 1];
                                    case 5: return [2 /*return*/];
                                }
                            });
                        });
                    };
                    languageModelResponse = { stream: stream() };
                    return [4 /*yield*/, (0, qaap_incremental_stream_parse_1.consumeIncrementalLanguageModelStream)(agent, languageModelResponse, request)];
                case 1:
                    _a.sent();
                    (0, chai_1.expect)(parseCalls).to.equal(1);
                    (0, chai_1.expect)(responseBody.content).to.have.length(1);
                    (0, chai_1.expect)(chat_model_1.MarkdownChatResponseContent.is(responseBody.content[0])).to.equal(true);
                    (0, chai_1.expect)(responseBody.content[0].content.value).to.include('token-119');
                    return [2 /*return*/];
            }
        });
    }); });
    it('consumeIncrementalLanguageModelStream re-parses when a code fence appears', function () { return __awaiter(void 0, void 0, void 0, function () {
        var parseCalls, agent, responseBody, request, parts, stream;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parseCalls = 0;
                    agent = {
                        parseContents: function (text, request) {
                            parseCalls++;
                            return (0, parse_contents_1.parseContents)(text, request);
                        },
                        parse: function (token) { return new chat_model_1.MarkdownChatResponseContentImpl((0, common_1.isTextResponsePart)(token) ? token.content : ''); },
                    };
                    responseBody = createMutableResponseBody();
                    request = { response: { response: responseBody } };
                    parts = ['Hello', '\n```ts\n', 'const a = 1\n', '```'];
                    stream = function () {
                        return __asyncGenerator(this, arguments, function () {
                            var _i, parts_1, content;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _i = 0, parts_1 = parts;
                                        _a.label = 1;
                                    case 1:
                                        if (!(_i < parts_1.length)) return [3 /*break*/, 5];
                                        content = parts_1[_i];
                                        return [4 /*yield*/, __await({ content: content })];
                                    case 2: return [4 /*yield*/, _a.sent()];
                                    case 3:
                                        _a.sent();
                                        _a.label = 4;
                                    case 4:
                                        _i++;
                                        return [3 /*break*/, 1];
                                    case 5: return [2 /*return*/];
                                }
                            });
                        });
                    };
                    return [4 /*yield*/, (0, qaap_incremental_stream_parse_1.consumeIncrementalLanguageModelStream)(agent, { stream: stream() }, request)];
                case 1:
                    _a.sent();
                    (0, chai_1.expect)(parseCalls).to.be.greaterThan(1);
                    (0, chai_1.expect)(responseBody.content.some(function (part) { return part.kind === 'code'; })).to.equal(true);
                    return [2 /*return*/];
            }
        });
    }); });
    it('consumeIncrementalLanguageModelStream inserts non-text tool tokens and resets markdown buffer', function () { return __awaiter(void 0, void 0, void 0, function () {
        var toolPart, agent, responseBody, request, stream;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    toolPart = new chat_model_1.ToolCallChatResponseContentImpl('tool-1', 'read_file', '{}', true);
                    agent = {
                        parseContents: function (text, request) { return (0, parse_contents_1.parseContents)(text, request); },
                        parse: function (token) {
                            if ((0, common_1.isTextResponsePart)(token)) {
                                return new chat_model_1.MarkdownChatResponseContentImpl(token.content);
                            }
                            if ('tool_calls' in token) {
                                return [toolPart];
                            }
                            return new chat_model_1.MarkdownChatResponseContentImpl('');
                        },
                    };
                    responseBody = createMutableResponseBody();
                    request = { response: { response: responseBody } };
                    stream = function () {
                        return __asyncGenerator(this, arguments, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, __await({ content: 'Before tool' })];
                                    case 1: return [4 /*yield*/, _a.sent()];
                                    case 2:
                                        _a.sent();
                                        return [4 /*yield*/, __await({ tool_calls: [{ id: 'tool-1', function: { name: 'read_file', arguments: '{}' } }] })];
                                    case 3: return [4 /*yield*/, _a.sent()];
                                    case 4:
                                        _a.sent();
                                        return [4 /*yield*/, __await({ content: ' after tool' })];
                                    case 5: return [4 /*yield*/, _a.sent()];
                                    case 6:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        });
                    };
                    return [4 /*yield*/, (0, qaap_incremental_stream_parse_1.consumeIncrementalLanguageModelStream)(agent, { stream: stream() }, request)];
                case 1:
                    _a.sent();
                    (0, chai_1.expect)(responseBody.content.some(function (part) { return part.kind === 'toolCall'; })).to.equal(true);
                    (0, chai_1.expect)(responseBody.content.filter(function (part) { return chat_model_1.MarkdownChatResponseContent.is(part); })).to.have.length(2);
                    return [2 /*return*/];
            }
        });
    }); });
    it('consumeIncrementalLanguageModelStream skips unknown stream chunks', function () { return __awaiter(void 0, void 0, void 0, function () {
        var parseCalls, agent, responseBody, request, stream;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parseCalls = 0;
                    agent = {
                        parseContents: function (text, request) {
                            parseCalls++;
                            return (0, parse_contents_1.parseContents)(text, request);
                        },
                        parse: function (token) { return new chat_model_1.MarkdownChatResponseContentImpl((0, common_1.isTextResponsePart)(token) ? token.content : ''); },
                    };
                    responseBody = createMutableResponseBody();
                    request = { response: { response: responseBody } };
                    stream = function () {
                        return __asyncGenerator(this, arguments, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, __await({ unexpected: true })];
                                    case 1: return [4 /*yield*/, _a.sent()];
                                    case 2:
                                        _a.sent();
                                        return [4 /*yield*/, __await({ content: 'ok' })];
                                    case 3: return [4 /*yield*/, _a.sent()];
                                    case 4:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        });
                    };
                    return [4 /*yield*/, (0, qaap_incremental_stream_parse_1.consumeIncrementalLanguageModelStream)(agent, { stream: stream() }, request)];
                case 1:
                    _a.sent();
                    (0, chai_1.expect)(parseCalls).to.equal(1);
                    (0, chai_1.expect)(responseBody.content).to.have.length(1);
                    return [2 /*return*/];
            }
        });
    }); });
    it('logs incremental parse stats when qaap.streamMetrics is enabled', function () { return __awaiter(void 0, void 0, void 0, function () {
        var previousStorage, storage, debugLines, previousDebug, agent, responseBody, request;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    previousStorage = global.localStorage;
                    storage = new Map();
                    global.localStorage = {
                        getItem: function (key) { var _a; return (_a = storage.get(key)) !== null && _a !== void 0 ? _a : null; },
                        setItem: function (key, value) { storage.set(key, value); },
                        removeItem: function (key) { storage.delete(key); },
                        clear: function () { storage.clear(); },
                        key: function () { return null; },
                        length: 0,
                    };
                    storage.set('qaap.streamMetrics', '1');
                    debugLines = [];
                    previousDebug = console.debug;
                    console.debug = function (message) {
                        if (typeof message === 'string') {
                            debugLines.push(message);
                        }
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 4]);
                    agent = {
                        parseContents: function (text, request) { return (0, parse_contents_1.parseContents)(text, request); },
                        parse: function (token) { return new chat_model_1.MarkdownChatResponseContentImpl((0, common_1.isTextResponsePart)(token) ? token.content : ''); },
                    };
                    responseBody = createMutableResponseBody();
                    request = { response: { response: responseBody } };
                    return [4 /*yield*/, (0, qaap_incremental_stream_parse_1.consumeIncrementalLanguageModelStream)(agent, {
                            stream: (function () {
                                return __asyncGenerator(this, arguments, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, __await({ content: 'metrics probe' })];
                                            case 1: return [4 /*yield*/, _a.sent()];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                });
                            })(),
                        }, request)];
                case 2:
                    _a.sent();
                    (0, chai_1.expect)(debugLines.some(function (line) { return line.includes('[Qaap incremental stream parse]'); })).to.equal(true);
                    return [3 /*break*/, 4];
                case 3:
                    console.debug = previousDebug;
                    if (previousStorage) {
                        global.localStorage = previousStorage;
                    }
                    else {
                        delete global.localStorage;
                    }
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
function createMutableResponseBody() {
    var state = { content: [], changes: 0 };
    return {
        get content() {
            return state.content;
        },
        clearContent: function () {
            state.content = [];
        },
        addContent: function (content) {
            state.content.push(content);
        },
        addContents: function (contents) {
            var _a;
            (_a = state.content).push.apply(_a, contents);
        },
        responseContentChanged: function () {
            state.changes++;
        },
    };
}
