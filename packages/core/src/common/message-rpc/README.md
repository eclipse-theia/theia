# message-rpc

An attempt to rewrite the theia RPC infrastructure with a couple of changes:

1. "Zero-copy" message writing and reading
2. Support for binary buffers without ever encoding them
3. Separate RPC server from RPC client
4. Use a unified "Channel" interface

A lot of this code is more or less copied from the current Theia code.
