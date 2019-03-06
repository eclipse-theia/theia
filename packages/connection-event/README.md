# Theia - Connection Event Extension

This extension recognizes when the web-socket from the theia browser side to the node-server side is disconnected, and posts a message to the parent window.

This allows listening on connection messages and react.

Message format:
```
{
    "topic":"Connection",
    "connected": <true/false>,
    "httpStatusCode: <optional, number - the returned code from an http request to the root of theia. 0 incase connection cannot be established>
}
```

### example usage

An HTML that embed Theia in an IFrame, and listens to message events:

```
<html>

<head title="Theia session expired demo">
</head>
<script>
    function handleMessages(e) {
        let message = JSON.parse(e.data);
        if (message.topic === "Connection" && message.connected == false) {
            alert("Connection disconnected. http code=" + message.code);
        }
    }
    if (window.addEventListener) {
        window.addEventListener("message", handleMessages, false);
    }
</script>

<body>
    <iframe src='http://localhost:3000' width="100%" height="100%" />
</body>

</html>
```
