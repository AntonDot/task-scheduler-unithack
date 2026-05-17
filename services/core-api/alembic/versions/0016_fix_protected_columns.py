"""Re-apply is_protected=true for default column names that may have been seeded after 0013.

Revision ID: 0016_fix_protected_columns
Revises: 0015_merge_heads
Create Date: 2026-05-16 11:50:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_fix_protected_columns"
down_revision: str | None = "0015_merge_heads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PROTECTED_NAMES = (
    "Backlog",
    "In Progress",
    "Review",
    "Done",
    "Бэклог",
    "В работе",
    "Ревью",
    "Готово",
    "To Do",
)


def upgrade() -> None:
    conn = op.get_bind()
    for name in _PROTECTED_NAMES:
        conn.execute(
            sa.text("UPDATE board_columns SET is_protected = TRUE WHERE name = :n"),
            {"n": name},
        )


def downgrade() -> None:
    pass  # intentionally irreversible — safe to keep
