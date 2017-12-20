# Theia - Cpp Extension

This extension uses [Clangd](https://clang.llvm.org/extra/clangd.html) to provide LSP features.

To install Clangd on Ubuntu 16.04:

```
wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | sudo apt-key add -
sudo echo "deb http://apt.llvm.org/xenial/ llvm-toolchain-xenial main" >  /etc/apt/sources.list.d/llvm.list
sudo apt-get update && sudo apt-get install -y clang-tools-6.0
sudo ln -s /usr/bin/clangd-6.0 /usr/bin/clangd
```

See [here](https://clang.llvm.org/extra/clangd.html#id4) for detailed  installation instructions.

## License
[Apache-2.0](https://github.com/theia-ide/theia/blob/master/LICENSE)
