-- Cleanup empty syllabi for inspectores-hacienda and tecnicos-hacienda
-- They were inserted without topics/subtopics due to a parser bug (now fixed).
-- After this migration, re-run sync-boe-syllabi to reinsert with correct data.

-- Delete subtopics (should be 0 but just in case)
DELETE FROM opposition_subtopics
WHERE syllabus_id IN (
  SELECT id FROM opposition_syllabi
  WHERE opposition_id IN ('inspectores-hacienda', 'tecnicos-hacienda')
);

-- Delete topics (should be 0 but just in case)
DELETE FROM opposition_topics
WHERE syllabus_id IN (
  SELECT id FROM opposition_syllabi
  WHERE opposition_id IN ('inspectores-hacienda', 'tecnicos-hacienda')
);

-- Delete the empty syllabi themselves
DELETE FROM opposition_syllabi
WHERE opposition_id IN ('inspectores-hacienda', 'tecnicos-hacienda');
