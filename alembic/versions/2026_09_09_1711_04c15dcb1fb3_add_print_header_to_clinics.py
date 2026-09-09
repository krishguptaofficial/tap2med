"""Add print_header to clinics

Revision ID: 04c15dcb1fb3
Revises: 51c42dea68af
Create Date: 2026-09-09T17:11:13.572537

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '04c15dcb1fb3'
down_revision: Union[str, None] = '51c42dea68af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clinics', sa.Column('print_header', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('clinics', 'print_header')
