"""Add system user for automations.

Revision ID: 0014_add_system_user
Revises: 0013_add_automations
Create Date: 2026-05-16 18:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0014_add_system_user"
down_revision: str | None = "0013_add_automations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Insert a system user with a reserved ID (e.g., 0 or 1, but let's use a unique email)
    # We use raw SQL because we don't want to rely on the User model being available/correct in the migration
    op.execute(
        "INSERT INTO users (full_name, email, password_hash, is_active) "
        "VALUES ('System', 'system@victory.local', 'SYSTEM_ACCOUNT', true) "
        "ON CONFLICT (email) DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM users WHERE email = 'system@victory.local'")
