#!/bin/bash

cat <<EOF | sudo tee /etc/init.d/kubeveth
#!/bin/sh
### BEGIN INIT INFO
# Provides:          kubeveth
# Required-Start:    \$network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Description:       Virtual network interface setup for Kubernetes cluster
### END INIT INFO

ip link add dev kubeveth type veth peer name veth1
ip addr add 100.60.100.1/24 dev kubeveth
ip link set kubeveth up
ip route add 100.60.100.0/24 dev kubeveth

EOF

sudo chmod +x /etc/init.d/kubeveth

sudo update-rc.d kubeveth defaults

sudo /etc/init.d/kubeveth
