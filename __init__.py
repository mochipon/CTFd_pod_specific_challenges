"""Challenge type providing pod-specific flag handling based on lab pods."""

from __future__ import annotations

import json
from typing import Dict, Optional

from flask import has_request_context, request

from CTFd.exceptions.challenges import ChallengeCreateException
from CTFd.models import Challenges, Flags, db
from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import (
    CHALLENGE_CLASSES,
    BaseChallenge,
)
from CTFd.plugins.flags import FLAG_CLASSES, BaseFlag
from CTFd.plugins.migrations import upgrade
from CTFd.utils.config.pages import build_markdown
from CTFd.utils.helpers import markup
from CTFd.utils.user import get_current_team, is_admin

try:
    from CTFd.plugins.CTFd_lab_pods import (
        get_team_pod_id as lab_get_pod_id,
    )
    from CTFd.plugins.CTFd_lab_pods import (
        substitute_pod_tokens,
    )
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "pod_specific_challenges requires the lab_pods plugin to be installed",
    ) from exc


def resolve_current_pod_id() -> Optional[int]:
    """Resolve the active pod identifier for the current request context."""
    if not has_request_context():
        return None
    team = get_current_team()
    if team is None:
        return None
    return lab_get_pod_id(team)


def compare_constant_time(expected: str, candidate: str) -> bool:
    """Compare two strings using a timing-safe equality check."""
    if expected is None or candidate is None:
        return False
    if len(expected) != len(candidate):
        return False
    result = 0
    for x, y in zip(expected, candidate):
        result |= ord(x) ^ ord(y)
    return result == 0


class PodSpecificChallenge(Challenges):
    """Challenge model whose description may reference pod identifiers."""

    __mapper_args__ = {"polymorphic_identity": "per_pod"}

    @property
    def html(self):
        description = self.description or ""
        pod_id = resolve_current_pod_id()
        if pod_id is not None:
            description = substitute_pod_tokens(description, pod_id)
        return markup(build_markdown(description))


class PodSpecificFlag(BaseFlag):
    """Flag type where acceptance is scoped to a particular pod."""

    name = "pod_specific"
    templates = {
        "create": "/plugins/CTFd_pod_specific_challenges/assets/flags/create.html",
        "update": "/plugins/CTFd_pod_specific_challenges/assets/flags/update.html",
    }

    @staticmethod
    def compare(flag, provided):
        """Validate the submission against the stored pod-specific flag."""
        expected_flag = (flag.content or "").strip()
        stored_data = (flag.data or "").strip()

        pod_id = resolve_current_pod_id()
        if pod_id is None and is_admin():
            override = request.args.get("pod_id") or request.form.get("pod_id")
            if override and str(override).isdigit():
                pod_id = int(override)

        if pod_id is None:
            return False

        try:
            expected_pod = int(stored_data)
        except (TypeError, ValueError):
            try:
                payload = json.loads(stored_data)
                expected_pod = int(payload.get("pod_id"))
            except (ValueError, TypeError, json.JSONDecodeError):
                return False

        if expected_pod != pod_id:
            return False

        return compare_constant_time(expected_flag, (provided or "").strip())


def parse_pod_flag_map(raw_text: Optional[str]) -> Dict[int, str]:
    """Parse a mapping of pod identifiers to flag values from a raw string."""
    mapping: Dict[int, str] = {}
    if not raw_text:
        return mapping

    for line_number, line in enumerate(str(raw_text).splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        if "=" not in stripped:
            raise ChallengeCreateException(
                f"Invalid pod flag on line {line_number}. Use the format 'pod_id=flag'.",
            )
        pod_text, flag_text = stripped.split("=", 1)
        try:
            pod_id = int(pod_text.strip())
        except ValueError as exc:
            raise ChallengeCreateException(
                f"Invalid pod id '{pod_text.strip()}' on line {line_number}.",
            ) from exc

        value = flag_text.strip()
        if value:
            mapping[pod_id] = value

    return mapping


def create_pod_specific_flags(challenge: Challenges, mapping: Dict[int, str]) -> None:
    """Persist per-pod flags for *challenge* based on *mapping*."""
    for pod_id, flag_value in mapping.items():
        db.session.add(
            Flags(
                challenge_id=challenge.id,
                type=PodSpecificFlag.name,
                content=flag_value,
                data=str(pod_id),
            ),
        )
    db.session.commit()


class PodSpecificChallengeType(BaseChallenge):
    """Challenge type that expects per-pod flag submissions."""

    id = "per_pod"
    name = "Per Pod"
    templates = {
        "create": "/plugins/CTFd_pod_specific_challenges/assets/create.html",
        "update": "/plugins/CTFd_pod_specific_challenges/assets/update.html",
        "view": "/plugins/CTFd_pod_specific_challenges/assets/view.html",
    }
    scripts = {
        "create": "/plugins/CTFd_pod_specific_challenges/assets/create.js",
        "update": "/plugins/CTFd_pod_specific_challenges/assets/update.js",
        "view": "/plugins/challenges/assets/view.js",
    }
    route = "/plugins/CTFd_pod_specific_challenges/assets/"

    @classmethod
    def create(cls, request):
        data = request.form or request.get_json() or {}
        mapping = parse_pod_flag_map(data.get("pod_specific_flags"))

        cleaned = dict(data)
        cleaned.pop("pod_specific_flags", None)

        class _Payload:
            form = cleaned

            @staticmethod
            def get_json():
                return cleaned

        challenge = super().create(_Payload)
        create_pod_specific_flags(challenge, mapping)
        return challenge


def load(app):
    """Register the pod specific challenge type with the application."""
    upgrade(plugin_name="pod_specific_challenges")
    CHALLENGE_CLASSES[PodSpecificChallengeType.id] = PodSpecificChallengeType
    FLAG_CLASSES[PodSpecificFlag.name] = PodSpecificFlag
    register_plugin_assets_directory(
        app,
        base_path="/plugins/CTFd_pod_specific_challenges/assets/",
    )
