"""Add custom columns and migrate tasks.

Revision ID: 0010_custom_columns
Revises: 0009_fix_users
Create Date: 2026-05-16 10:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_custom_columns"
down_revision: str | None = "0009_fix_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create board_columns table
    op.create_table(
        "board_columns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_board_columns_project_id"), "board_columns", ["project_id"], unique=False)

    # 2. Add column_id to tasks
    op.add_column("tasks", sa.Column("column_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_tasks_column_id"), "tasks", ["column_id"], unique=False)
    op.create_foreign_key("fk_tasks_column_id", "tasks", "board_columns", ["column_id"], ["id"], ondelete="RESTRICT")

    # 3. Data Migration
    conn = op.get_bind()

    # Get all projects
    projects_result = conn.execute(sa.text("SELECT id FROM projects"))
    project_ids = [row[0] for row in projects_result.fetchall()]

    for pid in project_ids:
        # Create columns
        col_data = [
            {"project_id": pid, "name": "Бэклог", "color": "#9CA3AF", "order": 0},
            {"project_id": pid, "name": "В работе", "color": "#3B82F6", "order": 1},
            {"project_id": pid, "name": "Ревью", "color": "#8B5CF6", "order": 2},
            {"project_id": pid, "name": "Готово", "color": "#10B981", "order": 3},
        ]

        for col in col_data:
            result = conn.execute(
                sa.text(
                    'INSERT INTO board_columns (project_id, name, color, "order") '
                    "VALUES (:project_id, :name, :color, :order) RETURNING id"
                ),
                col,
            )
            col_id = result.scalar()

            # Migrate tasks
            if col["name"] == "Бэклог":
                conn.execute(
                    sa.text(
                        "UPDATE tasks SET column_id = :cid WHERE project_id = :pid AND status IN ('AI_DRAFT', 'TODO')"
                    ),
                    {"cid": col_id, "pid": pid},
                )
            elif col["name"] == "В работе":
                conn.execute(
                    sa.text("UPDATE tasks SET column_id = :cid WHERE project_id = :pid AND status = 'IN_PROGRESS'"),
                    {"cid": col_id, "pid": pid},
                )
            elif col["name"] == "Ревью":
                conn.execute(
                    sa.text("UPDATE tasks SET column_id = :cid WHERE project_id = :pid AND status = 'REVIEW'"),
                    {"cid": col_id, "pid": pid},
                )
            elif col["name"] == "Готово":
                conn.execute(
                    sa.text("UPDATE tasks SET column_id = :cid WHERE project_id = :pid AND status = 'DONE'"),
                    {"cid": col_id, "pid": pid},
                )

    # Optional: Make column_id non-nullable if all tasks are migrated
    op.alter_column("tasks", "column_id", existing_type=sa.Integer(), nullable=False)

    # 4. Drop status column
    op.drop_index(op.f("ix_tasks_status"), table_name="tasks")
    op.drop_column("tasks", "status")


def downgrade() -> None:
    # 1. Add status column back
    op.add_column("tasks", sa.Column("status", sa.String(length=20), nullable=True))
    op.create_index(op.f("ix_tasks_status"), "tasks", ["status"], unique=False)

    # 2. Revert data (this is approximate, we can't perfectly recover AI_DRAFT vs TODO)
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE tasks SET status = 'TODO' WHERE column_id IN (SELECT id FROM board_columns WHERE \"order\" = 0)"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE tasks SET status = 'IN_PROGRESS' "
            'WHERE column_id IN (SELECT id FROM board_columns WHERE "order" = 1)'
        )
    )
    conn.execute(
        sa.text(
            "UPDATE tasks SET status = 'REVIEW' WHERE column_id IN (SELECT id FROM board_columns WHERE \"order\" = 2)"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE tasks SET status = 'DONE' WHERE column_id IN (SELECT id FROM board_columns WHERE \"order\" = 3)"
        )
    )

    op.alter_column("tasks", "status", existing_type=sa.String(length=20), nullable=False)

    # 3. Drop column_id
    op.drop_constraint("fk_tasks_column_id", "tasks", type_="foreignkey")
    op.drop_index(op.f("ix_tasks_column_id"), table_name="tasks")
    op.drop_column("tasks", "column_id")

    # 4. Drop board_columns table
    op.drop_index(op.f("ix_board_columns_project_id"), table_name="board_columns")
    op.drop_table("board_columns")
