"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-07-10
"""

from typing import Sequence, Union

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema is created via SQLAlchemy metadata in development bootstrap.
    # Production deployments should autogenerate migrations from models.
    pass


def downgrade() -> None:
    pass
