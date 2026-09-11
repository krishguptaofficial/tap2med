"""Add network_token to clinic_patient_lab_records

Revision ID: d8e3f2a1b4c5
Revises: c7b2a9e4d1f8
Create Date: 2026-09-11T11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e3f2a1b4c5'
down_revision: Union[str, None] = 'c7b2a9e4d1f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clinic_patient_lab_records', sa.Column('network_token', sa.Text(), nullable=True))
    op.create_index(op.f('ix_clinic_patient_lab_records_network_token'), 'clinic_patient_lab_records', ['network_token'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_clinic_patient_lab_records_network_token'), table_name='clinic_patient_lab_records')
    op.drop_column('clinic_patient_lab_records', 'network_token')

