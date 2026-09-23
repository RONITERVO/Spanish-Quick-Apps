const SHARED_ROLES = new Set(["region-heading", "shared-context"]);

// Only the current region's unchanged, fully completed bilingual pairs survive
// between narrations. Nothing is persisted or shared with other experiences.
export function createSharedNarrationMemory() {
  let region = null;
  let generation = 0;
  const heard = new Map();

  function reset() {
    region = null;
    generation += 1;
    heard.clear();
  }

  function setRegion(regionId) {
    const next = typeof regionId === "string" && regionId ? regionId : null;
    if (next !== region) {
      reset();
      region = next;
    }
  }

  function begin(regionId, segments, locale) {
    setRegion(regionId);
    const currentGeneration = ++generation;
    const candidates = segments.map((segment) => {
      if (
        !region ||
        !SHARED_ROLES.has(segment.role) ||
        typeof segment.id !== "string" ||
        !segment.id ||
        !segment.display ||
        !segment.narration ||
        !segment.translation
      )
        return null;
      return {
        id: segment.id,
        value: JSON.stringify([
          segment.role,
          segment.display,
          segment.narration,
          locale,
          segment.translation,
        ]),
      };
    });
    // Ambiguous duplicate IDs cannot safely identify a shared line.
    const counts = new Map();
    for (const item of candidates)
      if (item) counts.set(item.id, (counts.get(item.id) || 0) + 1);
    const eligible = candidates.map((item) =>
      item && counts.get(item.id) === 1 ? item : null,
    );
    const current = new Map(
      eligible.filter(Boolean).map((item) => [item.id, item.value]),
    );
    for (const [id, value] of heard) {
      if (current.get(id) !== value) heard.delete(id);
    }
    const skipped = eligible.map((item) =>
      Boolean(item && heard.get(item.id) === item.value),
    );
    return {
      skipped,
      completePair(index) {
        const item = eligible[index];
        if (item && generation === currentGeneration)
          heard.set(item.id, item.value);
      },
    };
  }

  return { begin, reset, setRegion };
}
