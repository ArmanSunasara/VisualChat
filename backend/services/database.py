"""Shared PostgreSQL connection factory used by backend services."""

import os

import psycopg
from pgvector.psycopg import register_vector


def db():
    connection = psycopg.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )
    register_vector(connection)
    return connection
