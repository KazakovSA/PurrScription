"""add user avatar

Revision ID: 002_user_avatar
Revises: 001_initial
"""

import sqlalchemy as sa
from alembic import op

revision = "002_user_avatar"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("user")}
    if "avatar_url" not in columns:
        op.add_column("user", sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("user")}
    if "avatar_url" in columns:
        op.drop_column("user", "avatar_url")
