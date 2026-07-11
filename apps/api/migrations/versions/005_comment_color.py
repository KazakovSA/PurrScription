"""comment color

Revision ID: 005_comment_color
Revises: 004_comment_time_assignments
"""

import sqlalchemy as sa
from alembic import op

revision = "005_comment_color"
down_revision = "004_comment_time_assignments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    comment_cols = {column["name"] for column in inspector.get_columns("comment")}
    if "color" not in comment_cols:
        op.add_column("comment", sa.Column("color", sa.String(length=16), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    comment_cols = {column["name"] for column in inspector.get_columns("comment")}
    if "color" in comment_cols:
        op.drop_column("comment", "color")
