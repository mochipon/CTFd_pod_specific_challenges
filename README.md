# Pod Specific Challenges Plugin

A CTFd plugin that enables pod-aware challenge management for network-focused Capture The Flag competitions. This plugin seamlessly integrates with the `CTFd_lab_pods` plugin to provide personalized challenge experiences based on team-specific infrastructure assignments.

## Overview

In network-focused CTF competitions, each team typically receives an isolated lab environment (pod) with unique IP ranges, credentials, and service configurations. The Pod Specific Challenges plugin bridges this infrastructure diversity with CTFd's challenge management, allowing administrators to create challenges that adapt dynamically to each team's assigned environment.

## Features

### Dynamic Challenge Descriptions
- Challenge descriptions support `:pod_id:` tokens that are automatically replaced with the viewer's assigned pod number
- Seamless integration with markdown rendering for rich content formatting
- Real-time token substitution ensures teams see their specific infrastructure details

### Pod-Specific Flag Validation
- Flag validation is automatically scoped to the user's assigned pod
- Administrators can define different flag values for each pod
- Constant-time flag comparison prevents timing-based attacks
- Admin override functionality for testing and validation

### Dependencies

- [`CTFd_lab_pods`](https://github.com/mochipon/CTFd_lab_pods) - Pod assignment and token substitution

## Installation

1. Clone this repository into your CTFd plugins directory:
```bash
cd /path/to/CTFd/CTFd/plugins
git clone https://github.com/mochipon/CTFd_pod_specific_challenges
```

2. Restart your CTFd instance to activate the plugin

## Usage

### Creating Pod-Specific Challenges

1. **Navigate to Admin Panel**: Go to `Admin > Challenges`
2. **Create New Challenge**: Click "Create Challenge"
3. **Select Challenge Type**: Choose "Per Pod" from the dropdown
4. **Configure Challenge Details**:
   - **Name**: Descriptive challenge title
   - **Category**: Appropriate challenge category
   - **Description**: Use `:pod_id:` tokens where pod numbers should appear
   - **Value**: Base point value for the challenge
5. **Configure Flags**:
   - **Default Flag**: Fallback flag used when no pod-specific match exists
   - **Pod Specific Flags**: Add individual flag values for each pod

### Example Challenge Description
```markdown
## Network Reconnaissance

Your team has been assigned pod `:pod_id:`. Connect to the target server at `192.168.:pod_id:.10` and identify the running services.

**Target Details:**
- IP Range: `192.168.:pod_id:.0/24`
- Gateway: `192.168.:pod_id:.1`
- SSH Access: `ssh team:pod_id:@192.168.:pod_id:.10`

Submit the flag found in `/home/user/flag.txt`.
```

## License

This project is licensed under the Apache License Version 2 License - see the [LICENSE](LICENSE) file for details.

## Compatibility

- **CTFd Version**: 3.0+
- **Python Version**: 3.11+
