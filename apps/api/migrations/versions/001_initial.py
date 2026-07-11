"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-07-10
"""

from typing import Sequence, Union

from alembic import op

import api.models  # noqa: F401
from api.database import Base

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
