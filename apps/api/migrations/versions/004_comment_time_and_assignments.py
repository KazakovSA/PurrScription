"""comment timeline position and task assignment ranges

Revision ID: 004_comment_time_assignments
Revises: 003_segment_word_timings
"""

import sqlalchemy as sa
from alembic import op

revision = "004_comment_time_assignments"
down_revision = "003_segment_word_timings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    comment_cols = {column["name"] for column in inspector.get_columns("comment")}
    if "time_seconds" not in comment_cols:
        op.add_column("comment", sa.Column("time_seconds", sa.Float(), nullable=True))
    if "time_end_seconds" not in comment_cols:
        op.add_column("comment", sa.Column("time_end_seconds", sa.Float(), nullable=True))

    assignment_cols = {column["name"] for column in inspector.get_columns("task_assignment")}
    if "start_seconds" not in assignment_cols:
        op.add_column("task_assignment", sa.Column("start_seconds", sa.Float(), nullable=True))
    if "end_seconds" not in assignment_cols:
        op.add_column("task_assignment", sa.Column("end_seconds", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    comment_cols = {column["name"] for column in inspector.get_columns("comment")}
    if "time_end_seconds" in comment_cols:
        op.drop_column("comment", "time_end_seconds")
    if "time_seconds" in comment_cols:
        op.drop_column("comment", "time_seconds")

    assignment_cols = {column["name"] for column in inspector.get_columns("task_assignment")}
    if "end_seconds" in assignment_cols:
        op.drop_column("task_assignment", "end_seconds")
    if "start_seconds" in assignment_cols:
        op.drop_column("task_assignment", "start_seconds")
