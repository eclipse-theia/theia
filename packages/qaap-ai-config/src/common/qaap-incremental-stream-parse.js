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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamBufferNeedsStructuredParse = streamBufferNeedsStructuredParse;
exports.patchAbstractStreamParsingChatAgentForIncrementalParse = patchAbstractStreamParsingChatAgentForIncrementalParse;
exports.consumeIncrementalLanguageModelStream = consumeIncrementalLanguageModelStream;
exports.resetIncrementalStreamPatchForTests = resetIncrementalStreamPatchForTests;
var common_1 = require("@theia/ai-core/lib/common");
var types_1 = require("@theia/core/lib/common/types");
var chat_agents_1 = require("@theia/ai-chat/lib/common/chat-agents");
var chat_model_1 = require("@theia/ai-chat/lib/common/chat-model");
var sync_stream_response_contents_1 = require("@theia/ai-chat/lib/common/sync-stream-response-contents");
/** Matches fenced-code openers that require {@link parseContents} during streaming. */
var STREAM_STRUCTURED_PARSE_PATTERN = /(^|\n)\s{0,3}(?:`{3,}|~{3,})/m;
var incrementalStreamPatchApplied = false;
function streamBufferNeedsStructuredParse(text) {
    return STREAM_STRUCTURED_PARSE_PATTERN.test(text);
}
function patchAbstractStreamParsingChatAgentForIncrementalParse() {
    if (incrementalStreamPatchApplied) {
        return;
    }
    incrementalStreamPatchApplied = true;
    // Product-layer seam: patch protected streaming hook without forking upstream ai-chat.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chat_agents_1.AbstractStreamParsingChatAgent.prototype.addStreamResponse = function (languageModelResponse, request) {
        return __awaiter(this, void 0, void 0, function () {
            var host;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        host = {
                            parseContents: function (text, req) { return _this.parseContents(text, req); },
                            parse: function (token, req) { return _this.parse(token, req); },
                        };
                        return [4 /*yield*/, consumeIncrementalLanguageModelStream(host, languageModelResponse, request)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
}
/**
 * Streaming loop compatible with upstream {@link AbstractStreamParsingChatAgent#addStreamResponse}
 * but appends plain markdown tokens in O(1) instead of re-parsing the full buffer every token.
 */
function consumeIncrementalLanguageModelStream(agent, languageModelResponse, request) {
    return __awaiter(this, void 0, void 0, function () {
        var completeTextBuffer, startIndex, parseCalls, _a, _b, _c, token, newContent, parsedContents, e_1_1, parsedContents;
        var _d, e_1, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    completeTextBuffer = '';
                    startIndex = request.response.response.content.length;
                    parseCalls = 0;
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 6, 7, 12]);
                    _a = true, _b = __asyncValues(languageModelResponse.stream);
                    _g.label = 2;
                case 2: return [4 /*yield*/, _b.next()];
                case 3:
                    if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 5];
                    _f = _c.value;
                    _a = false;
                    token = _f;
                    if (!(0, common_1.isLanguageModelStreamResponsePart)(token)) {
                        return [3 /*break*/, 4];
                    }
                    newContent = agent.parse(token, request);
                    if (!(0, common_1.isTextResponsePart)(token)) {
                        if ((0, types_1.isArray)(newContent)) {
                            request.response.response.addContents(newContent);
                        }
                        else if (newContent) {
                            request.response.response.addContent(newContent);
                        }
                        startIndex = request.response.response.content.length;
                        completeTextBuffer = '';
                        return [3 /*break*/, 4];
                    }
                    completeTextBuffer += token.content;
                    if (tryAppendIncrementalMarkdownToken(request, startIndex, token.content, completeTextBuffer)) {
                        return [3 /*break*/, 4];
                    }
                    parseCalls++;
                    parsedContents = agent.parseContents(completeTextBuffer, request);
                    (0, sync_stream_response_contents_1.syncStreamResponseContents)(request.response.response, startIndex, parsedContents);
                    _g.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _g.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _g.trys.push([7, , 10, 11]);
                    if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _e.call(_b)];
                case 8:
                    _g.sent();
                    _g.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12:
                    if (completeTextBuffer.length > 0) {
                        parseCalls++;
                        parsedContents = agent.parseContents(completeTextBuffer, request);
                        (0, sync_stream_response_contents_1.syncStreamResponseContents)(request.response.response, startIndex, parsedContents);
                    }
                    recordIncrementalParseStats(parseCalls, completeTextBuffer.length);
                    return [2 /*return*/];
            }
        });
    });
}
function tryAppendIncrementalMarkdownToken(request, startIndex, tokenDelta, completeTextBuffer) {
    if (streamBufferNeedsStructuredParse(completeTextBuffer)) {
        return false;
    }
    var response = request.response.response;
    var slice = response.content.slice(startIndex);
    if (slice.length === 0) {
        response.addContent(new chat_model_1.MarkdownChatResponseContentImpl(tokenDelta));
        response.responseContentChanged();
        return true;
    }
    if (slice.length === 1 && chat_model_1.MarkdownChatResponseContent.is(slice[0])) {
        slice[0].merge(new chat_model_1.MarkdownChatResponseContentImpl(tokenDelta));
        response.responseContentChanged();
        return true;
    }
    return false;
}
function recordIncrementalParseStats(parseCalls, charCount) {
    if (parseCalls === 0 || charCount === 0) {
        return;
    }
    if (typeof localStorage === 'undefined') {
        return;
    }
    try {
        if (localStorage.getItem('qaap.streamMetrics') !== '1') {
            return;
        }
    }
    catch (_a) {
        return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug("[Qaap incremental stream parse] parseCalls=".concat(parseCalls, " chars=").concat(charCount));
    }
}
/** Visible for unit tests. */
function resetIncrementalStreamPatchForTests() {
    incrementalStreamPatchApplied = false;
}
