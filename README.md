# Pod Specific Challenges Plugin

When running a network-focused CTF, each team often receives its own isolated
lab pod with unique IP ranges, credentials, and services. The Pod Specific
Challenges plugin allows those differences to be reflected directly in CTFd: a
single challenge can adapt its description and flags to the pod assigned to the
viewing team.

This plugin provides a challenge type (`per_pod`) that supports per-pod flag
validation. The default static flag is used as the baseline answer, while
additional overrides can be specified using the `Pod Specific` flag type. Pod
assignment information is sourced from the `lab_pods` plugin.

## Features

- Challenge descriptions may contain `:pod_id:` tokens for per-team rendering.
- Standard flag modal is augmented to let admins add Pod Specific flags.
- Submissions are validated in constant time and matched against the current
  user's pod ID (or an overridden pod ID for admins in preview mode).

## Requirements

- Plugins: [`CTFd_lab_pods`](https://github.com/mochipon/CTFd_lab_pods)  (for pod resolution)

## Installation

Clone this repo into your `CTFd/plugins/` directory then start/restart your CTFd instance.

```bash
git clone https://github.com/mochipon/CTFd_pod_specific_challenges
```
