import express from "express";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import type {RequestHandlerExtra} from "@modelcontextprotocol/sdk/server/types.js";

const server = new McpServer({
    name: "example-server",
    version: "1.0.0"
});

// 定义全局 transport 变量
let transport: SSEServerTransport;

// 设置服务器资源和工具
server.tool("tool", "这是一个测试工具", async (extra: RequestHandlerExtra) => {
    return {
        content: [{
            type: "text" as const,
            text: `Processed request ok.`
        }]
    };
});

server.resource("resource", "uri://resource", {
    contentType: "text/plain",
    isStatic: true
}, async () => {
    return {
        contents: [{
            text: "这是资源内容",
            uri: "resource://test",
            mimeType: "text/plain"
        }]
    };
});

const app = express();

app.get("/sse", async (req, res) => {
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
});

app.post("/messages", async (req, res) => {
    // Note: to support multiple simultaneous connections, these messages will
    // need to be routed to a specific matching transport. (This logic isn't
    // implemented here, for simplicity.)
    if (!transport) {
        res.status(400).json({error: "No active SSE connection"});
        return;
    }
    await transport.handlePostMessage(req, res);
});

app.listen(3001, () => {
    console.log('Server is running on port 3001');
});