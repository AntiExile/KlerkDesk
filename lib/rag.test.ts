import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkPdfPages,
  computeDeterministicEmbedding1536,
  VECTOR_EMBEDDING_DIMENSIONS,
} from './rag';

describe('Tender PDF RAG Chunking & Vector Embeddings', () => {
  it('preserves exact pageNumber on every chunk and uses overlapping slices', () => {
    const page1Text = Array.from({ length: 140 }, (_, idx) => `Clause-${idx + 1}`).join(' ');
    const page3Text = 'Compulsory briefing session at Municipal Civic Centre.';

    const chunks = chunkPdfPages([
      { pageNumber: 1, text: page1Text },
      { pageNumber: 2, text: '   ' },
      { pageNumber: 3, text: page3Text },
    ]);

    assert.ok(chunks.length >= 3, 'Expected page 1 to split into multiple chunks plus page 3');
    const page1Chunks = chunks.filter((c) => c.pageNumber === 1);
    const page2Chunks = chunks.filter((c) => c.pageNumber === 2);
    const page3Chunks = chunks.filter((c) => c.pageNumber === 3);

    assert.ok(page1Chunks.length >= 2);
    assert.equal(page2Chunks.length, 0);
    assert.equal(page3Chunks.length, 1);
    assert.equal(page3Chunks[0].text, page3Text);

    // Confirm overlap retains tail words between adjacent chunks on the same page
    const tailWords = page1Chunks[0].text.split(' ').slice(-4);
    assert.ok(
      tailWords.some((word) => page1Chunks[1].text.includes(word)),
      'Expected overlapping tokens across adjacent chunks'
    );
  });

  it('produces L2-normalized 1536-dim embeddings with higher similarity for matching tender concepts', () => {
    const sbdQuery = computeDeterministicEmbedding1536('compulsory SBD 4 director disclosure');
    const sbdDoc = computeDeterministicEmbedding1536('SBD 4 director disclosure declaration PFMA');
    const asphaltDoc = computeDeterministicEmbedding1536('bituminous asphalt wearing course kerb');

    assert.equal(sbdQuery.length, VECTOR_EMBEDDING_DIMENSIONS);
    assert.equal(sbdDoc.length, VECTOR_EMBEDDING_DIMENSIONS);

    const norm = Math.sqrt(sbdQuery.reduce((acc, v) => acc + v * v, 0));
    assert.ok(Math.abs(norm - 1) < 1e-6, `Expected unit L2 norm, got ${norm}`);

    const dot = (a: number[], b: number[]) =>
      a.reduce((acc, val, idx) => acc + val * b[idx], 0);

    assert.ok(
      dot(sbdQuery, sbdDoc) > dot(sbdQuery, asphaltDoc),
      'Expected SBD 4 query to score higher against SBD 4 document than asphalt spec'
    );
  });
});
