# Run this ONE command to give your PC keyless access to the OVH VPS.
# It will ask for the OVH password (from OVH's "installation" email) exactly once.
ssh ubuntu@51.195.148.206 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA2NiqE6SxQYWV52B7GXfD1d4cGFOQIpcB4Vf7pF43TT joshua@groundhopper' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo KEY-INSTALLED-OK"
