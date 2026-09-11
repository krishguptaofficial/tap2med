"""Add cross clinic consents table

Revision ID: c7b2a9e4d1f8
Revises: 04c15dcb1fb3
Create Date: 2026-09-11T09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7b2a9e4d1f8'
down_revision: Union[str, None] = '04c15dcb1fb3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cross_clinic_consents',
        sa.Column('consent_id', sa.UUID(), nullable=False),
        sa.Column('network_token', sa.Text(), nullable=False),
        sa.Column('clinic_id', sa.UUID(), nullable=False),
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.Column('consent_given', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('granted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['clinic_id'], ['clinics.clinic_id']),
        sa.ForeignKeyConstraint(['event_id'], ['events.event_id']),
        sa.PrimaryKeyConstraint('consent_id')
    )
    op.create_index(op.f('ix_cross_clinic_consents_network_token'), 'cross_clinic_consents', ['network_token'], unique=False)
    op.create_index(op.f('ix_cross_clinic_consents_clinic_id'), 'cross_clinic_consents', ['clinic_id'], unique=False)
    op.create_index(op.f('ix_cross_clinic_consents_event_id'), 'cross_clinic_consents', ['event_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_cross_clinic_consents_event_id'), table_name='cross_clinic_consents')
    op.drop_index(op.f('ix_cross_clinic_consents_clinic_id'), table_name='cross_clinic_consents')
    op.drop_index(op.f('ix_cross_clinic_consents_network_token'), table_name='cross_clinic_consents')
    op.drop_table('cross_clinic_consents')

