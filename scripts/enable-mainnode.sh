#!/bin/bash

# Enables pods scheduling on control plane node for development environment

NODE_NAME=$(hostname)

kubectl taint node $(hostname) node-role.kubernetes.io/control-plane:NoSchedule-
