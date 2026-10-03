import os
from functools import lru_cache


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer

    model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    return SentenceTransformer(model_name)


def embed_texts(texts: list[str]) -> list[list[float]]:
    vectors = _model().encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return vectors.tolist()

