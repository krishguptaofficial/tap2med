import uuid, datetime
rev = uuid.uuid4().hex[:12]
timestamp = datetime.datetime.now().strftime('%Y_%m_%d_%H%M')
filename = f'c:/tap2med/alembic/versions/{timestamp}_{rev}_add_phone_storage.py'

content = f'''"""add phone storage

Revision ID: {rev}
Revises: 45b7f0574a34
Create Date: {datetime.datetime.now().isoformat()}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '{rev}'
down_revision: Union[str, None] = '45b7f0574a34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clinics', sa.Column('save_patient_phone', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('clinic_patient_records', sa.Column('phone_number', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('clinic_patient_records', 'phone_number')
    op.drop_column('clinics', 'save_patient_phone')
'''

with open(filename, 'w') as f:
    f.write(content)
