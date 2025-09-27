"""Initial migration placeholder for pod_specific_challenges

Revision ID: b1c9a783c5c3
Revises:
Create Date: 2024-05-06 00:00:00.000000

"""

from __future__ import annotations

revision = "b1c9a783c5c3"
down_revision = None
branch_labels = None
depends_on = None


def upgrade(_: object = None) -> None:
    """No database changes needed for pod-specific challenges."""


def downgrade(_: object = None) -> None:
    """No database changes needed for pod-specific challenges."""
