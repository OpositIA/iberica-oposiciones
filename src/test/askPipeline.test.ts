import { describe, expect, it } from "vitest";

import {
  buildFallbackRetrievalQueries,
  extractArticleReferences,
  getSynthesisIssue,
  parseRewriteQueries
} from "../../supabase/functions/ask/pipelineGuards";

const QUESTION =
  "hazme un esquema del articulo 150,151 y 152 de la Constitucion española";
const REFUSAL = "No lo encuentro en el material aportado.";

describe("ask retrieval planning", () => {
  it("extracts every article in a compact multi-article reference", () => {
    expect(extractArticleReferences([QUESTION])).toEqual(["150", "151", "152"]);
  });

  it("builds one deterministic retrieval query per requested article", () => {
    const queries = buildFallbackRetrievalQueries(QUESTION);

    expect(queries).toEqual([
      "hazme un esquema del artículo 150 de la Constitucion española",
      "hazme un esquema del artículo 151 de la Constitucion española",
      "hazme un esquema del artículo 152 de la Constitucion española"
    ]);
    expect(queries.map((query) => extractArticleReferences([query]))).toEqual([
      ["150"],
      ["151"],
      ["152"]
    ]);
  });

  it("parses and deduplicates the structured rewrite response", () => {
    const raw = JSON.stringify({
      queries: [
        "artículo 150 Constitución Española",
        "articulo 150 Constitucion Espanola",
        "artículo 151 Constitución Española",
        "artículo 152 Constitución Española"
      ]
    });

    expect(parseRewriteQueries(raw)).toEqual([
      "artículo 150 Constitución Española",
      "artículo 151 Constitución Española",
      "artículo 152 Constitución Española"
    ]);
  });

  it("keeps compound article identifiers", () => {
    expect(
      extractArticleReferences([
        "artículos 5 bis, 5 ter y 150.1 Constitución Española"
      ])
    ).toEqual(["5bis", "5ter", "150.1"]);
  });
});

describe("ask synthesis guards", () => {
  it("accepts a response that covers every requested article", () => {
    const answer = [
      "### Artículo 150",
      "- Leyes marco",
      "### Artículo 151",
      "- Procedimiento",
      "### Artículo 152",
      "- Organización institucional"
    ].join("\n");

    expect(
      getSynthesisIssue(answer, ["150", "151", "152"], REFUSAL, true)
    ).toBeNull();
  });

  it("accepts a spaced suffix in a synthesized article heading", () => {
    expect(
      getSynthesisIssue("### Artículo 5 bis", ["5bis"], REFUSAL, true)
    ).toBeNull();
  });

  it("retries empty, unsupported refusal and incomplete responses", () => {
    expect(getSynthesisIssue("", ["150"], REFUSAL, true)).toBe("empty");
    expect(getSynthesisIssue(REFUSAL, ["150"], REFUSAL, true)).toBe(
      "unsupported_refusal"
    );
    expect(
      getSynthesisIssue(
        "### Artículo 150\n### Artículo 151",
        ["150", "151", "152"],
        REFUSAL,
        true
      )
    ).toBe("missing_articles");
  });
});
