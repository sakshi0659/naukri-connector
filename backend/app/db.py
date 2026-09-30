from sqlalchemy import create_engine,inspect,text
from sqlalchemy.orm import DeclarativeBase,sessionmaker
from .config import get_settings
class Base(DeclarativeBase): pass
s=get_settings();engine=create_engine(s.database_url,connect_args={'check_same_thread':False} if s.database_url.startswith('sqlite') else {},pool_pre_ping=True);SessionLocal=sessionmaker(bind=engine,expire_on_commit=False)

def migrate_schema():
    """Add tenant columns for existing local SQLite installs without deleting data."""
    if not s.database_url.startswith('sqlite'):
        return
    required={'jobs':['user_id','naukri_context'],'analyses':['user_id'],'applications':['user_id']}
    with engine.begin() as connection:
        inspector=inspect(connection)
        for table,columns in required.items():
            if table not in inspector.get_table_names():
                continue
            existing={column['name'] for column in inspector.get_columns(table)}
            for column in columns:
                if column not in existing:
                    connection.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} INTEGER'))
