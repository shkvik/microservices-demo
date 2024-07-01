#!/bin/bash

# Enables pods scheduling on control plane node for development environment
# Also marks current local node with all necessary labels to deploy any kind of objects
# that require specific node capabilities, like persistent storage nodes

NODE_NAME=$(hostname)

# Untaint local main node to allow local deployments
kubectl taint node $NODE_NAME node-role.kubernetes.io/control-plane:NoSchedule-

# Mark with persistence-managed-replicas capability to allow deployment of according services
# e.g. Redis or RabbitMQ, as they manage storage sync and failover by themselves across different storage instances
kubectl label nodes $NODE_NAME persistence-managed-replicas

# Mark with persistence-nfs capability to allow deployment of singleton storages that are accessed by cluster though network
# Such as multiple instances of application that are claiming the same NFS-type PV
kubectl label nodes $NODE_NAME persistence-nfs-single

# Mark with relay-proxy capability to allow deployment of traffic relays accessed by clients
# in order to achieve traffic routing optimization (e.g. globally distributed traffic proxies under anycast DNS)
kubectl label nodes $NODE_NAME relay-proxy
