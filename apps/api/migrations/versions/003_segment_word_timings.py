"""store exact Gecko word timings

Revision ID: 003_segment_word_timings
Revises: 002_user_avatar
"""

import sqlalchemy as sa
from alembic import op

revision = "003_segment_word_timings"
down_revision = "002_user_avatar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("segment")}
    if "word_timings" not in columns:
        op.add_column("segment", sa.Column("word_timings", sa.JSON(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("segment")}
    if "word_timings" in columns:
        op.drop_column("segment", "word_timings")
