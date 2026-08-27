export type DuoMatch = { id: number; teamA: string[]; teamB: string[] };

export const DUO_MATCH_COUNT = 6;
export const DUO_MIN_PLAYERS = 4;

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

const combinations = <T,>(arr: T[], k: number) => {
  const out: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      walk(i + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return out;
};

/**
 * A practical club-style generator:
 * - exactly `DUO_MATCH_COUNT` matches
 * - every match has two doubles teams
 * - appearance counts stay as even as possible
 * - partner repeats are minimized first, opponent repeats next
 * - for odd player counts, byes naturally rotate through the group
 */
export const generateDuoSchedule = (ids: string[]): DuoMatch[] => {
  const unique = [...new Set(ids)];
  if (unique.length < DUO_MIN_PLAYERS) return [];

  const partnerCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();
  const appearanceCount = new Map<string, number>();
  unique.forEach(id => {
    partnerCount.set(id, 0);
    appearanceCount.set(id, 0);
  });

  const candidateScore = (teamA: string[], teamB: string[]) => {
    let score = 0;

    // Keep participation balanced.
    const appearances = unique.map(id => appearanceCount.get(id) || 0);
    score += (Math.max(...appearances) - Math.min(...appearances)) * 18;
    [...teamA, ...teamB].forEach(id => score += (appearanceCount.get(id) || 0) * 3);

    // Strongly discourage repeating partners.
    score += (partnerCount.get(pairKey(teamA[0], teamA[1])) || 0) * 30;
    score += (partnerCount.get(pairKey(teamB[0], teamB[1])) || 0) * 30;

    // Discourage repeating opponents, but less strongly than repeated partners.
    for (const a of teamA) {
      for (const b of teamB) {
        score += (opponentCount.get(pairKey(a, b)) || 0) * 6;
      }
    }

    // Small random tie-break keeps the schedule from feeling deterministic.
    return score + Math.random() * 2;
  };

  const generated: DuoMatch[] = [];
  const groupsOfFour = combinations(unique, 4);

  for (let round = 0; round < DUO_MATCH_COUNT; round++) {
    // Evaluate every possible 4-player selection and all three team splits.
    const candidates = groupsOfFour.flatMap(([a, b, c, d]) => [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
    ].map(([teamA, teamB]) => ({ teamA, teamB, score: candidateScore(teamA, teamB) })));

    const chosen = candidates.sort((x, y) => x.score - y.score)[0];
    if (!chosen) break;

    generated.push({ id: round + 1, teamA: chosen.teamA, teamB: chosen.teamB });

    [chosen.teamA, chosen.teamB].forEach(teamIds => {
      const pk = pairKey(teamIds[0], teamIds[1]);
      partnerCount.set(pk, (partnerCount.get(pk) || 0) + 1);
      teamIds.forEach(id => appearanceCount.set(id, (appearanceCount.get(id) || 0) + 1));
    });

    for (const a of chosen.teamA) {
      for (const b of chosen.teamB) {
        const ok = pairKey(a, b);
        opponentCount.set(ok, (opponentCount.get(ok) || 0) + 1);
      }
    }
  }

  return generated;
};
