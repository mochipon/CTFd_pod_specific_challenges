"""Challenge type providing pod-specific flag handling based on lab pods.

This plugin provides a challenge type that adapts to individual team pods,
allowing for pod-specific descriptions and flag validation. It integrates
with the CTFd_lab_pods plugin to provide seamless per-team experiences.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from flask.wrappers import Request

from flask import Flask, has_request_context
from sqlalchemy.exc import SQLAlchemyError

from CTFd.exceptions.challenges import ChallengeCreateException
from CTFd.models import Challenges, Flags
from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import (
    CHALLENGE_CLASSES,
    BaseChallenge,
)
from CTFd.plugins.flags import FLAG_CLASSES, BaseFlag
from CTFd.plugins.migrations import upgrade
from CTFd.utils.config.pages import build_markdown
from CTFd.utils.helpers import markup
from CTFd.utils.user import get_current_team

# Configure logger for the plugin
logger = logging.getLogger(__name__)

# Import lab pods dependencies with proper error handling
try:
    from CTFd.plugins.CTFd_lab_pods import (
        get_team_pod_id,
        substitute_pod_tokens,
    )
except ImportError as exc:  # pragma: no cover
    logger.critical("Failed to import CTFd_lab_pods plugin")
    error_msg = (
        "pod_specific_challenges requires the lab_pods plugin to be installed. "
        "Please ensure CTFd_lab_pods is properly installed and configured."
    )
    raise RuntimeError(error_msg) from exc


def resolve_current_pod_id() -> int | None:
    """Resolve the active pod identifier for the current request context.

    This function determines the pod ID associated with the currently
    authenticated user's team. It handles cases where no request context
    exists or no team is assigned.

    Returns:
        The pod ID if found, None otherwise.

    Raises:
        SQLAlchemyError: If database query fails.

    """
    if not has_request_context():
        logger.debug("No request context available for pod ID resolution")
        return None

    try:
        team = get_current_team()
        if team is None:
            logger.debug("No current team found for pod ID resolution")
            return None

        pod_id = get_team_pod_id(team)
        if pod_id is not None:
            logger.debug("Resolved pod ID %s for team %s", pod_id, team.id)
        else:
            logger.debug("No pod assigned to team %s", team.id)

    except SQLAlchemyError:
        logger.exception("Database error during pod ID resolution")
        return None
    except Exception:
        logger.exception("Unexpected error during pod ID resolution")
        return None
    else:
        return pod_id


class PodSpecificChallenge(Challenges):
    """Challenge model whose description may reference pod identifiers.

    This model extends the base Challenges model to provide pod-aware
    challenge descriptions. The challenge description can contain
    `:pod_id:` tokens that are replaced with the viewer's assigned pod ID.
    """

    __mapper_args__ = {"polymorphic_identity": "per_pod"}

    @property
    def html(self) -> str:
        """Render the challenge description with pod token substitution.

        Returns:
            HTML-rendered challenge description with pod tokens substituted.
            Returns empty string if description is None or rendering fails.

        """
        try:
            description = self.description or ""
            if not description:
                return ""

            pod_id = resolve_current_pod_id()
            if pod_id is not None:
                description = substitute_pod_tokens(description, pod_id)
                logger.debug(
                    "Substituted pod tokens in challenge %s for pod %s",
                    self.id,
                    pod_id,
                )
            else:
                logger.debug(
                    "No pod ID available for challenge %s, using original description",
                    self.id,
                )

            return markup(build_markdown(description))
        except Exception:
            logger.exception(
                "Error rendering HTML for challenge %s",
                getattr(self, "id", "unknown"),
            )
            # Return safe fallback
            return markup(build_markdown(self.description or ""))


class PodSpecificFlag(BaseFlag):
    """Flag type where acceptance is scoped to a particular pod.

    This flag type validates submissions based on the user's assigned pod ID.
    Only users assigned to the correct pod can successfully submit the flag.

    Attributes:
        name: Unique identifier for this flag type.
        templates: HTML templates for flag creation and update forms.

    """

    name = "pod_specific"
    templates = {
        "create": "/plugins/CTFd_pod_specific_challenges/assets/flags/create.html",
        "update": "/plugins/CTFd_pod_specific_challenges/assets/flags/update.html",
    }

    @staticmethod
    def compare(flag: Flags, provided: str) -> bool:
        """Validate the submission against the stored pod-specific flag.

        This method performs pod-aware flag validation, ensuring that only
        users assigned to the correct pod can submit valid flags.

        Args:
            flag: The flag object containing the expected value and pod data.
            provided: The user-submitted flag value.

        Returns:
            True if the flag matches and the user's pod is correct, False otherwise.

        """
        if flag is None:
            logger.warning("Flag object is None in comparison")
            return False

        try:
            expected_flag = (flag.content or "").strip()
            stored_data = (flag.data or "").strip()
            provided_clean = (provided or "").strip()

            if not expected_flag or not stored_data:
                logger.warning(
                    "Empty flag content or data for flag %s",
                    getattr(flag, "id", "unknown"),
                )
                return False

            # Resolve current user's pod ID
            pod_id = resolve_current_pod_id()

            if pod_id is None:
                logger.debug("No pod ID available for flag validation")
                return False

            # Parse expected pod ID from stored data
            expected_pod: int | None = None
            try:
                expected_pod = int(stored_data)
            except (TypeError, ValueError):
                try:
                    payload = json.loads(stored_data)
                    expected_pod = int(payload.get("pod_id", 0))
                except (ValueError, TypeError, json.JSONDecodeError):
                    logger.exception(
                        "Failed to parse pod data for flag %s: %s",
                        getattr(flag, "id", "unknown"),
                        stored_data,
                    )
                    return False

            if expected_pod is None or expected_pod != pod_id:
                logger.debug(
                    "Pod ID mismatch: expected %s, got %s",
                    expected_pod,
                    pod_id,
                )
                return False

            # Perform flag comparison
            result = expected_flag == provided_clean
            if result:
                logger.info(
                    "Successful pod-specific flag validation for pod %s",
                    pod_id,
                )
            else:
                logger.debug(
                    "Flag content mismatch for pod %s",
                    pod_id,
                )

        except Exception:
            logger.exception(
                "Unexpected error during flag validation for flag %s",
                getattr(flag, "id", "unknown"),
            )
            return False
        else:
            return result


class PodSpecificChallengeType(BaseChallenge):
    """Challenge type that expects per-pod flag submissions.

    This challenge type provides pod-aware flag validation and description
    rendering. It allows administrators to create challenges that adapt to
    each team's assigned pod environment.

    Attributes:
        id: Unique identifier for this challenge type.
        name: Human-readable name for the challenge type.
        templates: HTML templates for challenge management.
        scripts: JavaScript files for enhanced functionality.
        route: Base route for serving static assets.

    """

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
    def create(cls, request: Request) -> Challenges:
        """Create a new pod-specific challenge.

        This method creates a basic pod-specific challenge. Pod-specific flags
        are created separately through the JavaScript interface using the
        standard CTFd flag API.

        Args:
            request: Flask request object containing form data or JSON.

        Returns:
            The created PodSpecificChallenge instance.

        Raises:
            ChallengeCreateException: If challenge creation fails.

        """
        try:
            data = request.form or request.get_json() or {}
            logger.info(
                "Creating pod-specific challenge with data keys: %s",
                list(data.keys()),
            )

            # Validate required fields
            if not data.get("name", "").strip():
                msg = "Challenge name is required"
                raise ChallengeCreateException(msg)

            if not data.get("category", "").strip():
                msg = "Challenge category is required"
                raise ChallengeCreateException(msg)

            # Create the base challenge using standard process
            challenge = super().create(request)

            logger.info(
                "Successfully created pod-specific challenge %s",
                challenge.id,
            )

        except ChallengeCreateException:
            # Re-raise challenge creation exceptions
            raise
        except Exception as exc:
            logger.exception("Unexpected error creating pod-specific challenge")
            msg = f"Failed to create pod-specific challenge: {exc!s}"
            raise ChallengeCreateException(msg) from exc
        else:
            return challenge


def load(app: Flask) -> None:
    """Register the pod specific challenge type with the application.

    This function is called by CTFd to initialize the plugin. It performs
    database migrations, registers challenge and flag types, and sets up
    static asset serving.

    Args:
        app: The Flask application instance.

    Raises:
        RuntimeError: If plugin initialization fails.

    """
    try:
        logger.info("Loading Pod Specific Challenges plugin")

        # Run database migrations
        logger.debug("Running database migrations")
        upgrade(plugin_name="pod_specific_challenges")

        # Register challenge type
        logger.debug("Registering challenge type: %s", PodSpecificChallengeType.id)
        CHALLENGE_CLASSES[PodSpecificChallengeType.id] = PodSpecificChallengeType

        # Register flag type
        logger.debug("Registering flag type: %s", PodSpecificFlag.name)
        FLAG_CLASSES[PodSpecificFlag.name] = PodSpecificFlag

        # Register static assets
        logger.debug("Registering plugin assets directory")
        register_plugin_assets_directory(
            app,
            base_path="/plugins/CTFd_pod_specific_challenges/assets/",
        )

        logger.info(
            "Pod Specific Challenges plugin loaded successfully. "
            "Challenge type: %s, Flag type: %s",
            PodSpecificChallengeType.id,
            PodSpecificFlag.name,
        )

    except Exception as exc:
        logger.exception("Failed to load Pod Specific Challenges plugin")
        msg = f"Pod Specific Challenges plugin initialization failed: {exc!s}"
        raise RuntimeError(msg) from exc
