# Theia - Connection Event Extension

This extension recognizes when the web-socket from the theia browser side to the node-server side is disconnected, and posts a message to the parent window.

This allows listening on disconnect messages and react.

Existing messages:
* 'Connection: SESSION_EXPIRED', when attempt to connect to the server returns http-status-code 401 or 403
* 'Connection: SERVER_ERROR', for error 500
* 'Connection: SERVER_UNAVAILABLE', for error 502 or for not being able to establish connection at all
* 'Connection: OK', when web-socket is extablished (or re-established)

### example usage

An HTML that embed Theia in an IFrame, and listens to message events:

```
<html>

<head title="Theia session expired demo">
</head>
<script>
    function handleMessages(e) {
        if (e.data.contains("ACCESS_DENIED")) {
            alert("Seems that your session is expired: " + e.data);
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
