export type DuoMatch = { id: number; teamA: string[]; teamB: string[] };

export const DUO_MATCH_COUNT = 6;
export const DUO_MIN_PLAYERS = 4;
export const DUO_MAX_CONSECUTIVE = 2;

const TEAM_SIZE = 2;
const FOUR = TEAM_SIZE * 2;

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

const shuffle = <T,>(items: T[]) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

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
 * Builds a `DUO_MATCH_COUNT`-match doubles schedule for the selected players.
 *
 * Rules, in priority order:
 * - nobody plays more than `DUO_MAX_CONSECUTIVE` matches in a row (only relaxed
 *   when exactly four players are selected, where it is impossible to honour)
 * - for 4-6 and 8 players, everyone appears within the first two matches; with
 *   7 the rotation starts immediately
 * - appearances stay balanced, and partner/opponent repeats are minimized
 */
export const generateDuoSchedule = (ids: string[]): DuoMatch[] => {
  const unique = [...new Set(ids)];
  if (unique.length < DUO_MIN_PLAYERS) return [];

  const appearances = new Map<string, number>();
  const consecutive = new Map<string, number>();
  const partnerCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();

  unique.forEach(id => {
    appearances.set(id, 0);
    consecutive.set(id, 0);
  });

  const rested = (id: string) => (consecutive.get(id) || 0) < DUO_MAX_CONSECUTIVE;

  const leastUsedFirst = (a: string, b: string) => {
    const ca = consecutive.get(a) || 0;
    const cb = consecutive.get(b) || 0;
    if (ca !== cb) return ca - cb;
    return (appearances.get(a) || 0) - (appearances.get(b) || 0);
  };

  const recordMatch = (teamA: string[], teamB: string[]) => {
    const playing = new Set([...teamA, ...teamB]);

    unique.forEach(id => {
      consecutive.set(id, playing.has(id) ? (consecutive.get(id) || 0) + 1 : 0);
    });

    for (const team of [teamA, teamB]) {
      const key = pairKey(team[0], team[1]);
      partnerCount.set(key, (partnerCount.get(key) || 0) + 1);
      team.forEach(id => appearances.set(id, (appearances.get(id) || 0) + 1));
    }

    for (const a of teamA) {
      for (const b of teamB) {
        const key = pairKey(a, b);
        opponentCount.set(key, (opponentCount.get(key) || 0) + 1);
      }
    }
  };

  const scoreFour = (four: string[], previous: DuoMatch | null) => {
    let score = Math.random() * 4;

    for (const id of four) {
      if (!rested(id)) return Infinity; // hard rule: never a third straight match
      score += (consecutive.get(id) || 0) * 25;
      score += (appearances.get(id) || 0) * 4;
    }

    const counts = unique.map(id => appearances.get(id) || 0);
    score += (Math.max(...counts) - Math.min(...counts)) * 20;

    if (previous) {
      const previousPlayers = new Set([...previous.teamA, ...previous.teamB]);
      const carried = four.filter(id => previousPlayers.has(id)).length;
      score += Math.max(0, carried - TEAM_SIZE) * 10;
      // Prefer some continuity, but do not force it.
      if (carried === TEAM_SIZE) score -= 8;
    }

    return score;
  };

  const scoreSplit = (teamA: string[], teamB: string[]) => {
    let score = Math.random() * 2;
    score += (partnerCount.get(pairKey(teamA[0], teamA[1])) || 0) * 50;
    score += (partnerCount.get(pairKey(teamB[0], teamB[1])) || 0) * 50;

    for (const a of teamA) {
      for (const b of teamB) {
        score += (opponentCount.get(pairKey(a, b)) || 0) * 8;
      }
    }
    return score;
  };

  const splitBest = ([a, b, c, d]: string[]): [string[], string[]] => {
    const options: [string[], string[]][] = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
    ];
    return options.sort((x, y) => scoreSplit(x[0], x[1]) - scoreSplit(y[0], y[1]))[0];
  };

  // With 4-6 or 8 players every selected player must appear across M1 + M2.
  // With 7 the normal rotation starts immediately.
  const firstTwoNeedCoverage = unique.length !== 7 && unique.length <= 8;

  const schedule: DuoMatch[] = [];
  const push = (four: string[]) => {
    const [teamA, teamB] = splitBest(four);
    schedule.push({ id: schedule.length + 1, teamA, teamB });
    recordMatch(teamA, teamB);
  };

  const firstFour = shuffle(unique).slice(0, FOUR);
  push(firstFour);

  let secondFour: string[];

  if (firstTwoNeedCoverage) {
    // Cover every player left out of M1 first, then fill up from M1:
    // n=4 -> all four return, n=5 -> one new, n=6 -> two new, n=8 -> fully fresh.
    const fresh = shuffle(unique.filter(id => !firstFour.includes(id))).slice(0, FOUR);
    const returning = shuffle(firstFour).filter(rested).slice(0, FOUR - fresh.length);
    secondFour = [...fresh, ...returning];

    if (secondFour.length < FOUR) {
      const fallback = shuffle(unique).filter(id => !secondFour.includes(id) && rested(id));
      secondFour.push(...fallback.slice(0, FOUR - secondFour.length));
    }

    // With only four players a rest is mathematically impossible; stay playable.
    if (secondFour.length < FOUR) secondFour = [...unique].slice(0, FOUR);
  } else {
    // 7 players: prefer two rested players from outside M1 plus two carry-overs.
    const eligible = shuffle(unique).filter(rested);
    const notInFirst = eligible.filter(id => !firstFour.includes(id));
    const inFirst = eligible.filter(id => firstFour.includes(id));
    secondFour = notInFirst.length >= TEAM_SIZE
      ? shuffle([...notInFirst.slice(0, TEAM_SIZE), ...inFirst.slice(0, TEAM_SIZE)])
      : eligible.slice(0, FOUR);
  }

  push(secondFour);

  while (schedule.length < DUO_MATCH_COUNT) {
    const previous = schedule[schedule.length - 1];
    const eligible = unique.filter(rested);

    // Too few rested players to fill a court (e.g. four or five selected):
    // fall back to everyone, least-used first, so the match stays playable.
    const pool = eligible.length >= FOUR ? eligible : [...unique].sort(leastUsedFirst);

    const candidates = combinations(pool, FOUR)
      .map(four => ({ four, score: scoreFour(four, previous) }))
      .filter(candidate => candidate.score !== Infinity);

    const chosen = candidates.sort((a, b) => a.score - b.score)[0]?.four
      ?? pool.slice(0, FOUR);

    push(chosen);
  }

  return schedule;
};
