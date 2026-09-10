"""add phone storage

Revision ID: 51c42dea68af
Revises: 45b7f0574a34
Create Date: 2026-09-08T10:41:28.096140

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '51c42dea68af'
down_revision: Union[str, None] = '45b7f0574a34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clinics', sa.Column('save_patient_phone', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('clinic_patient_records', sa.Column('phone_number', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('clinic_patient_records', 'phone_number')
    op.drop_column('clinics', 'save_patient_phone')
