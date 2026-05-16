"""Merge parallel migration branches.

Revision ID: 0015_merge_heads
Revises: 0014_soft_delete_tasks, 0014_add_system_user
Create Date: 2026-05-16 15:00:00.000000
"""

from collections.abc import Sequence

revision: str = "0015_merge_heads"
down_revision: tuple[str, str] = ("0014_soft_delete_tasks", "0014_add_system_user")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
