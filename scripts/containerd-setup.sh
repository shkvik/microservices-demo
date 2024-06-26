#!/bin/bash

# Stop services

sudo systemctl stop containerd.service

# Provide containerd with default CNI plugin for first cluster setup

echo "Installing CNI plugins for containerd..."

sudo mkdir -p /opt/cni/bin/
mkdir -p ./temp
if [ ! -f ./temp/cniplugins.tgz ]; then
    wget https://github.com/containernetworking/plugins/releases/download/v1.1.1/cni-plugins-linux-amd64-v1.1.1.tgz -O ./temp/cniplugins.tgz
fi
sudo tar Cxzvf /opt/cni/bin ./temp/cniplugins.tgz


# Fix containerd configuration

echo "Fixing containerd config..."

## Load default config
sudo mkdir -p /etc/containerd/
containerd config default | sudo tee /etc/containerd/config.toml

## Fix default sandbox image to comply with latest version of Kubernetes
sudo sed -i 's/pause\:3\.6/pause\:3\.9/g' /etc/containerd/config.toml

## Fix cgroup so that pods will not continuously crash
sudo sed -i 's/SystemdCgroup \= false/SystemdCgroup \= true/g' /etc/containerd/config.toml

# Restart services to apply changes

echo "Restarting services..."

sudo systemctl daemon-reload

sudo systemctl restart containerd.service

###

echo "Done!"