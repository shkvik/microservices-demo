#!/bin/bash

systemctl restart containerd.service

# Check privileges
if [ -n "$SUDO_USER" ]
then
   echo "Running as user $SUDO_USER"
else
   echo "Run this command as normal user with sudo:\n\nsudo ./cluster-setup.sh" && exit 1
fi

# Create virtual interface for cluster apiserver

source $(dirname $(realpath "$0"))/veth-setup.sh

# Reset previous setup & cleanup

kubeadm reset
rm -rf /home/$SUDO_USER/.kube

# Init new setup

kubeadm init --pod-network-cidr=10.244.0.0/16 --apiserver-advertise-address=100.60.100.1

# Pass new setup config to user for unprivileged access

mkdir -p /home/$SUDO_USER/.kube
echo "Copying /etc/kubernetes/admin.conf to /home/$SUDO_USER/.kube/config"
cp -f /etc/kubernetes/admin.conf /home/$SUDO_USER/.kube/config
chown $SUDO_USER /home/$SUDO_USER/.kube/config

# Use original config reference for further setup steps
export KUBECONFIG=/etc/kubernetes/admin.conf

# Install networking plugin

## Flannel
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml --validate=false

# Restart services

systemctl restart containerd.service
systemctl restart kubelet.service