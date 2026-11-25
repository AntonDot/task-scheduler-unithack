"""Which release answers and from which replica.

The release id is baked into the image at build time (Dockerfile ARG/ENV APP_VERSION,
k8s/build-images.sh), so a new version is a new image, not a config change. During a
rolling update, blue/green, canary or shadow several versions serve at once: the version
goes into every response (X-App-Version), GET /api/v1/version, the logs (service.version)
and the metric taskscheduler_build_info{version}.
"""

import os
import socket

APP_VERSION = os.environ.get("APP_VERSION", "dev")
# Kubernetes sets the hostname of a container to its pod name
POD_NAME = os.environ.get("HOSTNAME") or socket.gethostname()
