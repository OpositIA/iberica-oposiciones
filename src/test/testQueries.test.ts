import { describe, expect, it } from "vitest";

import {
  evaluateQuickTestAttempt,
  type OppositionTestExamConfig
} from "@/queries/testQueries";

const sampleQuestions = [
  {
    id: "q1",
    statement: "Pregunta 1",
    options: ["A", "B", "C", "D"],
    correctOptionIndex: 0
  },
  {
    id: "q2",
    statement: "Pregunta 2",
    options: ["A", "B", "C", "D"],
    correctOptionIndex: 1
  },
  {
    id: "q3",
    statement: "Pregunta 3",
    options: ["A", "B", "C", "D"],
    correctOptionIndex: 2
  },
  {
    id: "q4",
    statement: "Pregunta 4",
    options: ["A", "B", "C", "D"],
    correctOptionIndex: 3
  }
];

describe("evaluateQuickTestAttempt", () => {
  it("applies wrong answer penalties and scales the grade", () => {
    const config: OppositionTestExamConfig = {
      exerciseLabel: "Primer ejercicio",
      systemScope: "acceso libre",
      questionCount: 80,
      optionsCount: 4,
      correctAnswerValue: 1,
      wrongAnswerPenalty: 0.25,
      blankAnswerPenalty: 0,
      scoreMin: 0,
      scoreMax: 100,
      passingScore: 50,
      durationMinutes: 90,
      notes: null,
      sourceExcerpt: null,
      isPrimary: true
    };

    const result = evaluateQuickTestAttempt(
      sampleQuestions,
      {
        q1: 0,
        q2: 1,
        q3: 0,
        q4: 3
      },
      config
    );

    expect(result.correctCount).toBe(3);
    expect(result.wrongCount).toBe(1);
    expect(result.accuracy).toBe(75);
    expect(result.score).toBeCloseTo(68.75, 2);
    expect(result.scoreScaleMax).toBe(100);
  });

  it("falls back to the legacy 0-10 scale when no config exists", () => {
    const result = evaluateQuickTestAttempt(sampleQuestions, {
      q1: 0,
      q2: 1,
      q3: 0,
      q4: 3
    });

    expect(result.correctCount).toBe(3);
    expect(result.wrongCount).toBe(1);
    expect(result.score).toBeCloseTo(7.5, 2);
    expect(result.scoreScaleMax).toBe(10);
  });
});
