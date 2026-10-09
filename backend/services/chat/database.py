"""Chat schema initialization and persistence helpers."""

from backend.services.database import db


def init_chat_schema():
    with db() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'New chat',
                model TEXT,
                pinned BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            );
            ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id TEXT;
            CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
            -- The old table stored memory globally, so its rows cannot be
            -- safely assigned to a single conversation. Remove it rather
            -- than retain data that would outlive a deleted chat.
            DROP TABLE IF EXISTS global_memories;
            CREATE TABLE IF NOT EXISTS messages (
                id BIGSERIAL PRIMARY KEY,
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT,
                content TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS conversation_memories (
                id BIGSERIAL PRIMARY KEY,
                conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(conversation_id, content)
            );
            CREATE INDEX IF NOT EXISTS conversation_memories_conversation_idx
            ON conversation_memories (conversation_id, updated_at DESC);
            -- Branch metadata: a branch is a regular conversation that
            -- optionally links to a parent conversation at a specific turn
            -- index (0-based pair count of user+assistant message pairs).
            -- context_mode = 'inherit' | 'independent'
            ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parent_conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
            ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parent_turn_index INTEGER;
            ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_mode TEXT NOT NULL DEFAULT 'inherit';
            CREATE INDEX IF NOT EXISTS conversations_parent_idx
            ON conversations (parent_conversation_id)
            WHERE parent_conversation_id IS NOT NULL;
            """
        )
